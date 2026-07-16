import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import {
  createContext,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { AgentEvent, AgentSessionState } from "../agent/protocol";
import {
  agentSessionReducer,
  initialAgentSessionState,
} from "../agent/reducer";
import { disposeListener } from "../helpers/events";
import { codexModelArg, findModel } from "../agent/providers/catalog";
import {
  DEFAULT_AGENT_CONFIG,
  loadAgentConfig,
  saveAgentConfig,
  type AgentUserConfig,
} from "../agent/providers/config";
import {
  findSlashCommand,
  HELP_TEXT,
  parseSlashInput,
  SUBAGENTS_HELP,
  TOOLS_HELP,
} from "../agent/slash/commands";

type ApprovalDecision = "accept" | "acceptForSession" | "decline";

export interface AgentTab {
  draft: string;
  id: string;
  state: AgentSessionState;
  title: string;
}

interface AgentContextValue {
  activeTabId: string;
  clearActiveTab: () => void;
  closeTab: (id: string) => void;
  config: AgentUserConfig;
  connect: () => Promise<boolean>;
  createTab: () => void;
  followAgent: boolean;
  injectAssistantNote: (text: string) => void;
  interrupt: () => Promise<void>;
  modelId: string;
  modelPickerOpen: boolean;
  respondApproval: (id: string, decision: ApprovalDecision) => Promise<void>;
  /** Returns true if the draft was handled as a slash command. */
  runSlashCommand: (raw: string) => boolean;
  send: (prompt: string) => Promise<void>;
  setActiveTabId: (id: string) => void;
  setDraft: (draft: string) => void;
  setFollowAgent: (enabled: boolean) => void;
  setModelId: (modelId: string) => void;
  setModelPickerOpen: Dispatch<SetStateAction<boolean>>;
  state: AgentSessionState;
  tabs: AgentTab[];
}

const AgentContext = createContext<AgentContextValue | null>(null);

function createAgentTab(index: number): AgentTab {
  return {
    draft: "",
    id: crypto.randomUUID(),
    state: {
      ...initialAgentSessionState,
      approvals: [],
      changedFiles: [],
      messages: [],
      tools: {},
    },
    title: `Chat ${index}`,
  };
}

function titleFromPrompt(text: string): string {
  const compact = text.replace(/\s+/g, " ").trim();
  if (!compact) return "New chat";
  return compact.length > 28 ? `${compact.slice(0, 28)}…` : compact;
}

function mapTab(
  tabs: AgentTab[],
  id: string,
  update: (tab: AgentTab) => AgentTab,
): AgentTab[] {
  return tabs.map((tab) => (tab.id === id ? update(tab) : tab));
}

export function AgentProvider({ children }: { children: ReactNode }) {
  const seedTabRef = useRef<AgentTab | null>(null);
  if (!seedTabRef.current) {
    seedTabRef.current = createAgentTab(1);
  }
  const [tabs, setTabs] = useState<AgentTab[]>([seedTabRef.current]);
  const [activeTabId, setActiveTabId] = useState(seedTabRef.current.id);
  const [followAgent, setFollowAgent] = useState(true);
  const [config, setConfig] =
    useState<AgentUserConfig>(DEFAULT_AGENT_CONFIG);
  const [modelId, setModelIdState] = useState(DEFAULT_AGENT_CONFIG.defaultModelId);
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const liveOwnerRef = useRef<string | null>(null);
  const activeTabIdRef = useRef(activeTabId);
  const tabsRef = useRef(tabs);
  const modelIdRef = useRef(modelId);
  const tabCounterRef = useRef(1);

  activeTabIdRef.current = activeTabId;
  tabsRef.current = tabs;
  modelIdRef.current = modelId;

  const activeTab =
    tabs.find((tab) => tab.id === activeTabId) ?? tabs[0] ?? seedTabRef.current;
  const state = activeTab.state;

  const dispatchToTab = useCallback((tabId: string, event: AgentEvent) => {
    setTabs((current) =>
      mapTab(current, tabId, (tab) => {
        const nextState = agentSessionReducer(tab.state, event);
        const nextTitle =
          event.type === "user_message" &&
          tab.state.messages.length === 0 &&
          tab.title.startsWith("Chat ")
            ? titleFromPrompt(event.text)
            : tab.title;
        return {
          ...tab,
          state: nextState,
          title: nextTitle,
        };
      }),
    );
  }, []);

  useEffect(() => {
    let cancelled = false;
    void loadAgentConfig()
      .then((stored) => {
        if (cancelled) return;
        setConfig(stored);
        setModelIdState(stored.defaultModelId);
      })
      .catch((error) => {
        if (!cancelled) {
          dispatchToTab(activeTabIdRef.current, {
            type: "error",
            message: `Failed to load agent config: ${String(error)}`,
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [dispatchToTab]);

  const injectAssistantNote = useCallback(
    (text: string) => {
      const tabId = activeTabIdRef.current;
      dispatchToTab(tabId, {
        type: "host_message",
        messageId: `note-${crypto.randomUUID()}`,
        text,
      });
    },
    [dispatchToTab],
  );

  useEffect(() => {
    const unlisten = listen<AgentEvent>("agent-event", (event) => {
      const owner = liveOwnerRef.current ?? activeTabIdRef.current;
      dispatchToTab(owner, event.payload);
    });
    return () => {
      disposeListener(unlisten);
    };
  }, [dispatchToTab]);

  const setModelId = useCallback((next: string) => {
    const selected = findModel(next);
    if (!selected || selected.engine !== "codex") return;
    const active = tabsRef.current.find(
      (tab) => tab.id === activeTabIdRef.current,
    );
    if (active?.state.status === "running") return;
    setModelIdState(next);
    setConfig((current) => {
      const updated = { ...current, defaultModelId: next };
      void saveAgentConfig(updated).catch((error) => {
        dispatchToTab(activeTabIdRef.current, {
          type: "error",
          message: `Failed to save agent config: ${String(error)}`,
        });
      });
      return updated;
    });
    // Force reconnect on next send with new model.
    liveOwnerRef.current = null;
    setTabs((current) =>
      current.map((tab) =>
        tab.id === activeTabIdRef.current
          ? {
              ...tab,
              state: {
                ...tab.state,
                sessionId: undefined,
                status:
                  tab.state.status === "running" ? "idle" : tab.state.status,
              },
            }
          : tab,
      ),
    );
  }, [dispatchToTab]);

  const connect = useCallback(async () => {
    const tabId = activeTabIdRef.current;
    const workspace = localStorage.getItem("project");
    if (!workspace) {
      dispatchToTab(tabId, {
        type: "error",
        message: "Open a project first.",
      });
      return false;
    }

    const selected = findModel(modelIdRef.current);
    if (selected && selected.engine === "flue") {
      dispatchToTab(tabId, {
        type: "error",
        message:
          `Model ${selected.displayName} needs the Lava (Flue) runtime, which is not wired yet. ` +
          "Pick a Codex model for now, or connect Codex.",
      });
      return false;
    }

    dispatchToTab(tabId, { type: "session_connecting", runtime: "codex" });
    try {
      const sessionId = await invoke<string>("agent_start_session", {
        model: codexModelArg(modelIdRef.current),
        workspace,
      });
      liveOwnerRef.current = tabId;
      setTabs((current) =>
        current.map((tab) => {
          if (tab.id === tabId) {
            return {
              ...tab,
              state: agentSessionReducer(tab.state, {
                type: "session_ready",
                runtime: "codex",
                sessionId,
              }),
            };
          }
          if (tab.state.sessionId && tab.state.status !== "disconnected") {
            return {
              ...tab,
              state: {
                ...tab.state,
                sessionId: undefined,
                status:
                  tab.state.status === "running" ? "idle" : tab.state.status,
                turnId: undefined,
              },
            };
          }
          return tab;
        }),
      );
      return true;
    } catch (error) {
      dispatchToTab(tabId, { type: "error", message: String(error) });
      return false;
    }
  }, [dispatchToTab]);

  const clearActiveTab = useCallback(() => {
    const tabId = activeTabIdRef.current;
    setTabs((current) =>
      mapTab(current, tabId, (tab) => ({
        ...tab,
        draft: "",
        state: {
          ...initialAgentSessionState,
          approvals: [],
          changedFiles: [],
          messages: [],
          tools: {},
        },
        title: "New chat",
      })),
    );
    if (liveOwnerRef.current === tabId) {
      liveOwnerRef.current = null;
    }
  }, []);

  const runSlashCommand = useCallback(
    (raw: string) => {
      const parsed = parseSlashInput(raw);
      if (!parsed) return false;
      const command = findSlashCommand(parsed.name);
      if (!command) {
        injectAssistantNote(
          `Unknown command \`/${parsed.name}\`.\n\n${HELP_TEXT}`,
        );
        return true;
      }

      switch (command.name) {
        case "help":
          injectAssistantNote(HELP_TEXT);
          return true;
        case "clear":
          clearActiveTab();
          return true;
        case "new": {
          tabCounterRef.current += 1;
          const tab = createAgentTab(tabCounterRef.current);
          setTabs((current) => [...current, tab]);
          setActiveTabId(tab.id);
          return true;
        }
        case "model":
          if (parsed.args) {
            const match =
              findModel(parsed.args) ||
              findModel(`codex/${parsed.args}`);
            if (match?.engine === "codex") {
              setModelId(match.id);
              injectAssistantNote(`Model set to **${match.displayName}**.`);
            } else if (match) {
              injectAssistantNote(
                `Model **${match.displayName}** needs the Lava runtime, which ships in a later milestone.`,
              );
            } else {
              injectAssistantNote(
                `Unknown model \`${parsed.args}\`. Use /model to open the picker.`,
              );
            }
          } else {
            setModelPickerOpen(true);
          }
          return true;
        case "connect":
          setModelPickerOpen(true);
          return true;
        case "sessions": {
          const list = tabsRef.current
            .map(
              (tab, index) =>
                `${tab.id === activeTabIdRef.current ? "→" : " "} ${index + 1}. ${tab.title} (\`${tab.id.slice(0, 8)}\`)`,
            )
            .join("\n");
          injectAssistantNote(`**Agent tabs**\n\n${list}`);
          return true;
        }
        case "workspace": {
          const workspace = localStorage.getItem("project") ?? "(none)";
          injectAssistantNote(`Workspace: \`${workspace}\``);
          return true;
        }
        case "tools":
          injectAssistantNote(TOOLS_HELP);
          return true;
        case "subagents":
          injectAssistantNote(SUBAGENTS_HELP);
          return true;
        case "plan": {
          const next = {
            ...config,
            planMode: !config.planMode,
          };
          setConfig(next);
          void saveAgentConfig(next).catch((error) => {
            dispatchToTab(activeTabIdRef.current, {
              type: "error",
              message: `Failed to save agent config: ${String(error)}`,
            });
          });
          injectAssistantNote(
            next.planMode
              ? "Plan mode **on** (takes effect on Lava/Flue runtime)."
              : "Plan mode **off**.",
          );
          return true;
        }
        default:
          return true;
      }
    },
    [clearActiveTab, config, dispatchToTab, injectAssistantNote, setModelId],
  );

  const send = useCallback(
    async (prompt: string) => {
      const text = prompt.trim();
      if (!text) return;

      if (text.startsWith("/")) {
        runSlashCommand(text);
        setTabs((current) =>
          mapTab(current, activeTabIdRef.current, (entry) => ({
            ...entry,
            draft: "",
          })),
        );
        return;
      }

      const tabId = activeTabIdRef.current;
      const tab = tabsRef.current.find((entry) => entry.id === tabId);
      const ownsProcess =
        liveOwnerRef.current === tabId && Boolean(tab?.state.sessionId);

      if (!ownsProcess) {
        const connected = await connect();
        if (!connected) return;
      }

      dispatchToTab(tabId, {
        type: "user_message",
        messageId: crypto.randomUUID(),
        text,
      });
      setTabs((current) =>
        mapTab(current, tabId, (entry) => ({ ...entry, draft: "" })),
      );

      try {
        await invoke("agent_send", { prompt: text });
      } catch (error) {
        dispatchToTab(tabId, { type: "error", message: String(error) });
      }
    },
    [connect, dispatchToTab, runSlashCommand],
  );

  const interrupt = useCallback(async () => {
    const tabId = activeTabIdRef.current;
    const tab = tabsRef.current.find((entry) => entry.id === tabId);
    if (!tab?.state.turnId || liveOwnerRef.current !== tabId) return;
    try {
      await invoke("agent_interrupt", { turnId: tab.state.turnId });
    } catch (error) {
      dispatchToTab(tabId, { type: "error", message: String(error) });
    }
  }, [dispatchToTab]);

  const respondApproval = useCallback(
    async (id: string, decision: ApprovalDecision) => {
      const tabId = activeTabIdRef.current;
      try {
        await invoke("agent_respond_approval", {
          decision,
          requestId: id,
        });
        dispatchToTab(tabId, { type: "approval_resolved", approvalId: id });
      } catch (error) {
        dispatchToTab(tabId, { type: "error", message: String(error) });
      }
    },
    [dispatchToTab],
  );

  const createTab = useCallback(() => {
    tabCounterRef.current += 1;
    const tab = createAgentTab(tabCounterRef.current);
    setTabs((current) => [...current, tab]);
    setActiveTabId(tab.id);
  }, []);

  const closeTab = useCallback((id: string) => {
    setTabs((current) => {
      if (current.length <= 1) {
        tabCounterRef.current += 1;
        const replacement = createAgentTab(tabCounterRef.current);
        setActiveTabId(replacement.id);
        if (liveOwnerRef.current === id) {
          liveOwnerRef.current = null;
        }
        return [replacement];
      }

      const index = current.findIndex((tab) => tab.id === id);
      const next = current.filter((tab) => tab.id !== id);
      if (activeTabIdRef.current === id) {
        const neighbor = next[Math.max(0, index - 1)] ?? next[0];
        setActiveTabId(neighbor.id);
      }
      if (liveOwnerRef.current === id) {
        liveOwnerRef.current = null;
      }
      return next;
    });
  }, []);

  const setDraft = useCallback((draft: string) => {
    const tabId = activeTabIdRef.current;
    setTabs((current) =>
      mapTab(current, tabId, (tab) => ({ ...tab, draft })),
    );
  }, []);

  const value = useMemo<AgentContextValue>(
    () => ({
      activeTabId,
      clearActiveTab,
      closeTab,
      config,
      connect,
      createTab,
      followAgent,
      injectAssistantNote,
      interrupt,
      modelId,
      modelPickerOpen,
      respondApproval,
      runSlashCommand,
      send,
      setActiveTabId,
      setDraft,
      setFollowAgent,
      setModelId,
      setModelPickerOpen,
      state,
      tabs,
    }),
    [
      activeTabId,
      clearActiveTab,
      closeTab,
      config,
      connect,
      createTab,
      followAgent,
      injectAssistantNote,
      interrupt,
      modelId,
      modelPickerOpen,
      respondApproval,
      runSlashCommand,
      send,
      setDraft,
      setModelId,
      state,
      tabs,
    ],
  );

  return (
    <AgentContext.Provider value={value}>{children}</AgentContext.Provider>
  );
}

export function useAgent() {
  const context = useContext(AgentContext);
  if (!context) {
    throw new Error("useAgent must be used inside AgentProvider");
  }
  return context;
}
