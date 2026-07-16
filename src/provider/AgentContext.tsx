import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useReducer,
  useState,
} from "react";
import type { AgentEvent } from "../agent/protocol";
import {
  agentSessionReducer,
  initialAgentSessionState,
} from "../agent/reducer";
import { disposeListener } from "../helpers/events";

type ApprovalDecision = "accept" | "acceptForSession" | "decline";

interface AgentContextValue {
  connect: () => Promise<void>;
  followAgent: boolean;
  interrupt: () => Promise<void>;
  respondApproval: (id: string, decision: ApprovalDecision) => Promise<void>;
  send: (prompt: string) => Promise<void>;
  setFollowAgent: (enabled: boolean) => void;
  state: ReturnType<typeof agentSessionReducer>;
}

const AgentContext = createContext<AgentContextValue | null>(null);

export function AgentProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(
    agentSessionReducer,
    initialAgentSessionState,
  );
  const [followAgent, setFollowAgent] = useState(true);

  useEffect(() => {
    const unlisten = listen<AgentEvent>("agent-event", (event) => {
      dispatch(event.payload);
    });
    return () => {
      disposeListener(unlisten);
    };
  }, []);

  const connect = useCallback(async () => {
    const workspace = localStorage.getItem("project");
    if (!workspace) {
      dispatch({ type: "error", message: "Open a project first." });
      return;
    }

    dispatch({ type: "session_connecting", runtime: "codex" });
    try {
      const sessionId = await invoke<string>("agent_start_session", {
        model: null,
        workspace,
      });
      dispatch({ type: "session_ready", runtime: "codex", sessionId });
    } catch (error) {
      dispatch({ type: "error", message: String(error) });
    }
  }, []);

  const send = useCallback(
    async (prompt: string) => {
      const text = prompt.trim();
      if (!text) return;

      if (!state.sessionId) {
        await connect();
      }

      dispatch({
        type: "user_message",
        messageId: crypto.randomUUID(),
        text,
      });
      try {
        await invoke("agent_send", { prompt: text });
      } catch (error) {
        dispatch({ type: "error", message: String(error) });
      }
    },
    [connect, state.sessionId],
  );

  const interrupt = useCallback(async () => {
    if (!state.turnId) return;
    try {
      await invoke("agent_interrupt", { turnId: state.turnId });
    } catch (error) {
      dispatch({ type: "error", message: String(error) });
    }
  }, [state.turnId]);

  const respondApproval = useCallback(
    async (id: string, decision: ApprovalDecision) => {
      try {
        await invoke("agent_respond_approval", {
          decision,
          requestId: id,
        });
        dispatch({ type: "approval_resolved", approvalId: id });
      } catch (error) {
        dispatch({ type: "error", message: String(error) });
      }
    },
    [],
  );

  return (
    <AgentContext.Provider
      value={{
        connect,
        followAgent,
        interrupt,
        respondApproval,
        send,
        setFollowAgent,
        state,
      }}
    >
      {children}
    </AgentContext.Provider>
  );
}

export function useAgent() {
  const context = useContext(AgentContext);
  if (!context) {
    throw new Error("useAgent must be used inside AgentProvider");
  }
  return context;
}
