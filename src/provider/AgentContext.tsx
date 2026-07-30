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
import type {
  AgentEvent,
  AgentSessionState,
  RoutedAgentEvent,
  TabDisplayStatus,
} from "../agent/protocol";
import {
  buildAgentSendPayload,
  deriveTabStatus,
  isUntitledTab,
  titleFromPrompt,
} from "../agent/protocol";
import {
  agentSessionReducer,
  initialAgentSessionState,
} from "../agent/reducer";
import { disposeListener } from "../helpers/events";
import {
  codexModelArg,
  findAvailableModel,
  findModel,
  isModelSelectionChange,
} from "../agent/providers/catalog";
import {
  DEFAULT_AGENT_CONFIG,
  loadAgentConfig,
  saveAgentConfig,
  type AgentUserConfig,
} from "../agent/providers/config";

const attributionTails = new Map<string, Promise<void>>();
export function awaitAgentAttribution(sessionId: string): Promise<void> {
  return attributionTails.get(sessionId) ?? Promise.resolve();
}
import {
  HELP_TEXT,
  validateSlashInput,
} from "../agent/slash/commands";
import {
  DEFAULT_AGENT_PROFILES,
  isRunnableProfile,
  loadProfiles,
  type AgentProfile,
} from "../agent/profiles";
import {
  buildAgentPrompt,
  flushEditorContext,
  getEditorContext,
  type AgentPromptAttachments,
} from "../agent/editorContext";
import {
  DEFAULT_AGENT_WORKSPACE_MODE,
  type AgentWorkspaceMode,
  type WorktreeStatus,
} from "../components/agent/worktree";

type ApprovalDecision = "accept" | "acceptForSession" | "decline";

export interface AgentTab {
  baseRevision: string;
  draft: string;
  id: string;
  profileId: string;
  queue: string[];
  state: AgentSessionState;
  title: string;
  workspaceMode: AgentWorkspaceMode;
}

interface StoredTab {
  backend: string;
  id: string;
  opaqueSessionId?: string;
  profileId?: string;
  queue: string[];
  state: AgentSessionState;
  title: string;
  updatedAt: number;
  workspace: string;
  worktree?: WorktreeStatus;
}

interface AgentContextValue {
  activeTabId: string;
  clearActiveTab: () => void;
  closeTab: (id: string) => Promise<void>;
  config: AgentUserConfig;
  connect: () => Promise<boolean>;
  createTab: () => void;
  followAgent: boolean;
  injectAssistantNote: (text: string) => void;
  interrupt: () => Promise<void>;
  modelId: string;
  modelPickerOpen: boolean;
  profileId: string;
  profiles: AgentProfile[];
  updateProfiles: (profiles: AgentProfile[]) => void;
  /** Queued messages waiting to be sent when the agent becomes idle. */
  queuedMessages: string[];
  respondApproval: (id: string, decision: ApprovalDecision) => Promise<void>;
  /** Returns true if the draft was handled as a slash command. */
  runSlashCommand: (raw: string) => boolean;
  send: (prompt: string) => Promise<void>;
  setActiveTabId: (id: string) => void;
  setDraft: (draft: string) => void;
  setFollowAgent: (enabled: boolean) => void;
  setModelId: (modelId: string) => void;
  setProfileId: (profileId: string) => void;
  setModelPickerOpen: Dispatch<SetStateAction<boolean>>;
  setWorkspaceMode: (mode: AgentWorkspaceMode) => void;
  setBaseRevision: (revision: string) => void;
  state: AgentSessionState;
  /** Derived display status for the active tab. */
  tabStatus: TabDisplayStatus;
  tabs: AgentTab[];
}

const AgentContext = createContext<AgentContextValue | null>(null);

function createAgentTab(index: number): AgentTab {
  return {
    baseRevision: "HEAD",
    draft: "",
    id: crypto.randomUUID(),
    profileId: "codex-native",
    queue: [],
    state: {
      ...initialAgentSessionState,
      approvals: [],
      changedFiles: [],
      messages: [],
      tools: {},
    },
    title: `Chat ${index}`,
    workspaceMode: DEFAULT_AGENT_WORKSPACE_MODE,
  };
}

function mapTab(
  tabs: AgentTab[],
  id: string,
  update: (tab: AgentTab) => AgentTab,
): AgentTab[] {
  return tabs.map((tab) => (tab.id === id ? update(tab) : tab));
}

function threadAttachmentsFor(
  prompt: string,
  tabs: AgentTab[],
): AgentPromptAttachments {
  return {
    threads: tabs
      .filter(
        (tab) =>
          prompt.includes(`$${tab.id}`) || prompt.includes(`\${${tab.id}}`),
      )
      .map((tab) => ({
        id: tab.id,
        messages: tab.state.messages.map(({ role, text }) => ({ role, text })),
        title: tab.title,
      })),
  };
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
  const [profiles, setProfiles] = useState<AgentProfile[]>(DEFAULT_AGENT_PROFILES);
  const [profileId, setProfileIdState] = useState("codex-native");
  const profileIdRef = useRef(profileId);
  const activeTabIdRef = useRef(activeTabId);
  const tabsRef = useRef(tabs);
  const modelIdRef = useRef(modelId);
  const tabCounterRef = useRef(1);
  const persistenceErrorsRef = useRef(new Set<string>());

  activeTabIdRef.current = activeTabId;
  tabsRef.current = tabs;
  modelIdRef.current = modelId;
  profileIdRef.current = profileId;

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
          isUntitledTab(tab.title)
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
    const workspace = localStorage.getItem("project") ?? "";
    if (workspace) void invoke<StoredTab[]>("agent_load_sessions", { workspace })
      .then((stored) => {
        if (cancelled || stored.length === 0) return;
        const restored = stored.map((tab) => ({
          baseRevision: tab.worktree?.baseRevision ?? "HEAD",
          draft: "",
          id: tab.id,
          profileId: tab.profileId ?? "codex-native",
          queue: tab.queue ?? [],
          state: {
            ...initialAgentSessionState,
            ...tab.state,
            approvals: [],
            runtimeConnection: "offline" as const,
            runtimeContext: "restored" as const,
            status: "disconnected" as const,
            turnId: undefined,
          },
          title: tab.title,
          workspaceMode: tab.worktree
            ? "isolated-worktree" as const
            : DEFAULT_AGENT_WORKSPACE_MODE,
        }));
        setTabs(restored);
        setActiveTabId(restored[restored.length - 1].id);
        tabCounterRef.current = restored.length;
      })
      .catch((error) => {
        if (!cancelled) dispatchToTab(activeTabIdRef.current, {
          type: "error",
          message: `Could not load saved agent sessions. In-memory chat remains available: ${String(error)}`,
        });
      });
    void loadAgentConfig()
      .then((stored) => {
        if (cancelled) return;
        setConfig(stored);
        setModelIdState(stored.defaultModelId);
        setProfileIdState(stored.selectedProfileId);
      })
      .catch((error) => {
        if (!cancelled) {
          dispatchToTab(activeTabIdRef.current, {
            type: "error",
            message: `Failed to load agent config: ${String(error)}`,
          });
        }
      });
    void loadProfiles()
      .then((loaded) => {
        const runnable = loaded.filter(isRunnableProfile);
        setProfiles(runnable.length > 0 ? runnable : DEFAULT_AGENT_PROFILES);
      })
      .catch(() => setProfiles(DEFAULT_AGENT_PROFILES));
    return () => {
      cancelled = true;
    };
  }, [dispatchToTab]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const workspace = localStorage.getItem("project") ?? "";
      if (!workspace) return;
      for (const tab of tabs) {
        void invoke("agent_persist_session", {
          tab: {
            backend: tab.state.runtime ?? "codex",
            id: tab.id,
            opaqueSessionId: tab.state.sessionId,
            profileId: tab.profileId,
            queue: tab.queue,
            state: tab.state,
            title: tab.title,
            updatedAt: 0,
            workspace,
            worktree: undefined,
          },
        }).catch((error) => {
          const key = `${tab.id}:${String(error)}`;
          if (persistenceErrorsRef.current.has(key)) return;
          persistenceErrorsRef.current.add(key);
          dispatchToTab(tab.id, {
            type: "error",
            message: `Could not save this agent session. History may be lost on restart: ${String(error)}`,
          });
        });
      }
    }, 100);
    return () => window.clearTimeout(timer);
  }, [tabs]);

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

  const createTab = useCallback(() => {
    tabCounterRef.current += 1;
    const tab = createAgentTab(tabCounterRef.current);
    setTabs((current) => [...current, tab]);
    setActiveTabId(tab.id);
  }, []);

  const closeTab = useCallback(async (id: string) => {
    try {
      await invoke("agent_end_session", { sessionId: id });
    } catch (error) {
      dispatchToTab(id, { type: "error", message: `Failed to close session: ${String(error)}` });
      return;
    }
    try {
      await invoke("agent_delete_session", { sessionId: id });
    } catch (error) {
      dispatchToTab(id, { type: "error", message: `Runtime ended, but the saved session could not be deleted. The tab was kept to prevent it returning after restart: ${String(error)}` });
      return;
    }
    setTabs((current) => {
      if (current.length <= 1) {
        tabCounterRef.current += 1;
        const replacement = createAgentTab(tabCounterRef.current);
        setActiveTabId(replacement.id);
        return [replacement];
      }

      const index = current.findIndex((tab) => tab.id === id);
      const next = current.filter((tab) => tab.id !== id);
      if (activeTabIdRef.current === id) {
        const neighbor = next[Math.max(0, index - 1)] ?? next[0];
        setActiveTabId(neighbor.id);
      }
      return next;
    });
  }, [dispatchToTab]);

  const flushQueue = useCallback(
    async (tabId: string) => {
      const tab = tabsRef.current.find((entry) => entry.id === tabId);
      if (!tab || tab.queue.length === 0) return;
      // Only flush when the agent is idle.
      if (tab.state.status !== "idle") return;

      const [next, ...rest] = tab.queue;
      setTabs((current) =>
        mapTab(current, tabId, (entry) => ({ ...entry, queue: rest })),
      );
      dispatchToTab(tabId, {
        type: "user_message",
        messageId: crypto.randomUUID(),
        text: next,
      });
      try {
        await flushEditorContext();
        await invoke(
          "agent_send",
          buildAgentSendPayload(
            tabId,
            buildAgentPrompt(
              next,
              getEditorContext(),
              threadAttachmentsFor(next, tabsRef.current),
            ),
            next,
          ),
        );
      } catch (error) {
        dispatchToTab(tabId, { type: "error", message: String(error) });
      }
    },
    [dispatchToTab],
  );

  useEffect(() => {
    const unlisten = listen<RoutedAgentEvent>("agent-event", (event) => {
      const routed = event.payload as RoutedAgentEvent;
      dispatchToTab(routed.sessionId, routed);
      if (routed.type === "file_changed" || routed.type === "file_touched") {
        window.dispatchEvent(
          new CustomEvent("rocket-agent-file-changed", {
            detail: { path: routed.path, sessionId: routed.sessionId },
          }),
        );
        const prior = attributionTails.get(routed.sessionId) ?? Promise.resolve();
        const next = prior.catch(() => undefined).then(() =>
          invoke<void>("agent_attribute_path", { sessionId: routed.sessionId, path: routed.path }),
        ).catch((error) => {
          dispatchToTab(routed.sessionId, {
            type: "error",
            message: `Could not track agent change for ${routed.path}: ${String(error)}`,
          });
          throw error;
        });
        attributionTails.set(routed.sessionId, next);
        void next.catch(() => undefined);
      }
      if (routed.type === "turn_completed") {
        const prior = attributionTails.get(routed.sessionId) ?? Promise.resolve();
        const reconciled = prior.then(async () => {
          const changes = await invoke<Array<{ path: string }>>("agent_reconcile_changes", {
            sessionId: routed.sessionId,
          });
          window.dispatchEvent(new CustomEvent("rocket-agent-review-updated", {
            detail: { count: changes.length, sessionId: routed.sessionId },
          }));
        }).catch((error) => {
          dispatchToTab(routed.sessionId, {
            type: "error",
            message: `Could not reconcile the agent change set: ${String(error)}`,
          });
          throw error;
        });
        attributionTails.set(routed.sessionId, reconciled);
        // Auto-flush queued messages only after the completed turn's change set
        // is fully reconciled.
        void reconciled.then(() => flushQueue(routed.sessionId)).catch(() => undefined);
      }
    });
    return () => {
      disposeListener(unlisten);
    };
  }, [dispatchToTab, flushQueue]);

  // Keyboard shortcuts: Cmd+N (new tab), Cmd+W (close tab), Cmd+[ / Cmd+] (switch tabs).
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return;
      if (event.key === "n" && !event.shiftKey) {
        event.preventDefault();
        createTab();
      } else if (event.key === "w" && !event.shiftKey) {
        event.preventDefault();
        closeTab(activeTabIdRef.current);
      } else if (event.key === "]") {
        event.preventDefault();
        const tabs = tabsRef.current;
        const index = tabs.findIndex(
          (tab) => tab.id === activeTabIdRef.current,
        );
        if (tabs.length > 1) {
          setActiveTabId(tabs[(index + 1) % tabs.length].id);
        }
      } else if (event.key === "[") {
        event.preventDefault();
        const tabs = tabsRef.current;
        const index = tabs.findIndex(
          (tab) => tab.id === activeTabIdRef.current,
        );
        if (tabs.length > 1) {
          setActiveTabId(
            tabs[(index - 1 + tabs.length) % tabs.length].id,
          );
        }
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [closeTab, createTab]);

  const setModelId = useCallback((next: string) => {
    const selected = findModel(next);
    if (!selected || selected.engine !== "codex") return;
    if (!isModelSelectionChange(modelIdRef.current, next)) return;
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
    // End the current Codex session so the next send starts fresh.
    void invoke("agent_end_session", { sessionId: activeTabIdRef.current }).catch(
      () => {},
    );
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

    const tabProfileId = tabsRef.current.find((tab) => tab.id === tabId)?.profileId ?? profileIdRef.current;
    const selectedProfile = profiles.find((profile) => profile.id === tabProfileId)
      ?? DEFAULT_AGENT_PROFILES[0];
    if (!isRunnableProfile(selectedProfile)) {
      dispatchToTab(tabId, {
        type: "error",
        message: `${selectedProfile.displayName} is not available in this build.`,
      });
      return false;
    }
    const runtime = "codex";
    dispatchToTab(tabId, { type: "session_connecting", runtime });
    try {
      await invoke<string>("agent_start_session", {
        sessionId: tabId,
        model: codexModelArg(modelIdRef.current),
        workspace,
      });
      dispatchToTab(tabId, {
        type: "session_ready",
        runtime,
        sessionId: tabId,
      });
      return true;
    } catch (error) {
      dispatchToTab(tabId, { type: "error", message: String(error) });
      return false;
    }
  }, [dispatchToTab, profiles]);

  const setProfileId=useCallback((next:string)=>{if(!profiles.some(p=>p.id===next))return;setProfileIdState(next);setConfig(current=>{const updated={...current,selectedProfileId:next};void saveAgentConfig(updated);return updated});void invoke("agent_end_session",{sessionId:activeTabIdRef.current}).catch(()=>{});setTabs(current=>mapTab(current,activeTabIdRef.current,tab=>({...tab,profileId:next,state:{...tab.state,sessionId:undefined,status:"disconnected"}})));},[profiles]);

  const setWorkspaceMode = useCallback((workspaceMode: AgentWorkspaceMode) => {
    setTabs((current) => mapTab(current, activeTabIdRef.current, (tab) => ({ ...tab, workspaceMode })));
  }, []);
  const setBaseRevision = useCallback((baseRevision: string) => {
    setTabs((current) => mapTab(current, activeTabIdRef.current, (tab) => ({ ...tab, baseRevision })));
  }, []);

  const clearActiveTab = useCallback(() => {
    const tabId = activeTabIdRef.current;
    void invoke("agent_end_session", { sessionId: tabId }).catch(() => {});
    setTabs((current) =>
      mapTab(current, tabId, (tab) => ({
        ...tab,
        draft: "",
        queue: [],
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
  }, []);

  const runSlashCommand = useCallback(
    (raw: string) => {
      const validation = validateSlashInput(raw);
      if (!validation) return false;
      if (!validation.ok) {
        injectAssistantNote(validation.error);
        return true;
      }
      const { args, command } = validation;

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
          if (args) {
            const match =
              findAvailableModel(args) ||
              findAvailableModel(`codex/${args}`);
            if (match) {
              setModelId(match.id);
              injectAssistantNote(`Model set to **${match.displayName}**.`);
            } else {
              injectAssistantNote(
                `Unknown model \`${args}\`. Use /model to open the picker.`,
              );
            }
          } else {
            setModelPickerOpen(true);
          }
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
        case "checkpoint":
          void (async () => {
            try {
              await flushEditorContext();
              const checkpoint = await invoke<{ id: number }>("agent_create_checkpoint", {
                sessionId: activeTabIdRef.current,
                label: args || null,
              });
              injectAssistantNote(`Checkpoint **#${checkpoint.id}** created.`);
            } catch (error) {
              injectAssistantNote(`Checkpoint creation failed: ${String(error)}`);
            }
          })();
          return true;
        case "checkpoints":
          void invoke<Array<{ id: number; label: string; kind: string; fileCount: number }>>("agent_list_checkpoints")
            .then((items) => injectAssistantNote(items.length
              ? `**Safe points**\n\n${items.map((item) => `#${item.id} — ${item.label} (${item.kind}, ${item.fileCount} files)`).join("\n")}\n\nUse \`/checkpoint-restore ID\` or \`/checkpoint-delete ID\`.`
              : "No checkpoints exist for this workspace."))
            .catch((error) => injectAssistantNote(`Could not list checkpoints: ${String(error)}`));
          return true;
        case "checkpoint-restore":
          void (async () => {
            const checkpointId = Number(args);
            try {
              await flushEditorContext();
              let result: { paths: string[] };
              try {
                result = await invoke("agent_restore_checkpoint", { checkpointId, force: false });
              } catch (error) {
                if (!String(error).includes("conflicts with current bytes") || !window.confirm(`${String(error)}\n\nRestore anyway?`)) throw error;
                result = await invoke("agent_restore_checkpoint", { checkpointId, force: true });
              }
              for (const path of result.paths) window.dispatchEvent(new CustomEvent("rocket-agent-file-changed", { detail: { path } }));
              injectAssistantNote(`Restored checkpoint **#${checkpointId}** (${result.paths.length} paths).`);
            } catch (error) { injectAssistantNote(`Checkpoint restore failed: ${String(error)}`); }
          })();
          return true;
        case "checkpoint-delete":
          void (async () => {
            const checkpointId = Number(args);
            if (!window.confirm(`Delete checkpoint #${checkpointId}?`)) return;
            try {
              await invoke("agent_delete_checkpoint", { checkpointId });
              injectAssistantNote(`Deleted checkpoint **#${checkpointId}**.`);
            } catch (error) { injectAssistantNote(`Checkpoint deletion failed: ${String(error)}`); }
          })();
          return true;
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
      const hasSession = Boolean(tab?.state.sessionId);
      const isBusy =
        tab?.state.status === "running" ||
        (tab?.state.approvals.length ?? 0) > 0;

      // Queue the message if the agent is busy — Maestro-style message queueing.
      if (isBusy) {
        dispatchToTab(tabId, {
          type: "host_message",
          messageId: `queued-${crypto.randomUUID()}`,
          text: `_Queued: ${text}_`,
        });
        setTabs((current) =>
          mapTab(current, tabId, (entry) => ({
            ...entry,
            draft: "",
            queue: [...entry.queue, text],
          })),
        );
        return;
      }

      if (tab && tab.state.messages.length === 0 && isUntitledTab(tab.title)) {
        setTabs((current) =>
          mapTab(current, tabId, (entry) => ({
            ...entry,
            title: titleFromPrompt(text),
          })),
        );
      }

      if (!hasSession) {
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
        await flushEditorContext();
        await invoke(
          "agent_send",
          buildAgentSendPayload(
            tabId,
            buildAgentPrompt(
              text,
              getEditorContext(),
              threadAttachmentsFor(text, tabsRef.current),
            ),
            text,
          ),
        );
      } catch (error) {
        dispatchToTab(tabId, { type: "error", message: String(error) });
      }
    },
    [connect, dispatchToTab, runSlashCommand],
  );

  const interrupt = useCallback(async () => {
    const tabId = activeTabIdRef.current;
    const tab = tabsRef.current.find((entry) => entry.id === tabId);
    if (!tab?.state.turnId || !tab.state.sessionId) return;
    try {
      await invoke("agent_interrupt", {
        sessionId: tabId,
        turnId: tab.state.turnId,
      });
    } catch (error) {
      dispatchToTab(tabId, { type: "error", message: String(error) });
    }
  }, [dispatchToTab]);

  const respondApproval = useCallback(
    async (id: string, decision: ApprovalDecision) => {
      const tabId = activeTabIdRef.current;
      try {
        await invoke("agent_respond_approval", {
          sessionId: tabId,
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
      profileId,
      profiles,
      updateProfiles: setProfiles,
      queuedMessages: activeTab?.queue ?? [],
      respondApproval,
      runSlashCommand,
      send,
      setActiveTabId,
      setDraft,
      setFollowAgent,
      setModelId,
      setProfileId,
      setModelPickerOpen,
      setWorkspaceMode,
      setBaseRevision,
      state,
      tabStatus: deriveTabStatus(state),
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
      profileId,
      profiles,
      respondApproval,
      runSlashCommand,
      send,
      setDraft,
      setModelId,
      setProfileId,
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
