export type AgentRuntimeKind =
  | "codex"
  | "acp"
  | "ollama"
  | "lm-studio"
  | "openai-compatible";

export type AgentSessionStatus =
  | "disconnected"
  | "connecting"
  | "idle"
  | "running"
  | "error";

export interface AgentMessage {
  id: string;
  role: "user" | "assistant";
  status: "complete" | "streaming";
  text: string;
}

export interface AgentTool {
  id: string;
  kind: "command" | "file" | "search" | "tool";
  label: string;
  output?: string;
  path?: string;
  status: "completed" | "failed" | "running";
}

export interface AgentFileChange {
  additions: number;
  deletions: number;
  path: string;
  toolId?: string;
}

export interface AgentApproval {
  description: string;
  id: string;
  kind: "command" | "file" | "permissions" | "tool";
}

export interface AgentBackendEvent {
  event: string;
  payload: unknown;
}

export interface AgentBackendCapabilities {
  [key: string]: unknown;
}

export type AgentEvent =
  | { type: "session_connecting"; runtime: AgentRuntimeKind }
  | { type: "session_ready"; runtime: AgentRuntimeKind; sessionId: string }
  | { type: "turn_started"; turnId: string }
  | { type: "user_message"; messageId: string; text: string }
  | { type: "host_message"; messageId: string; text: string }
  | { type: "message_delta"; messageId: string; text: string }
  | { type: "reasoning_delta"; text: string }
  | { type: "tool_started"; tool: AgentTool }
  | { type: "tool_output"; output: string; toolId: string }
  | {
      type: "tool_completed";
      status: "completed" | "failed";
      toolId: string;
    }
  | { type: "file_touched"; path: string; toolId?: string }
  | ({ type: "file_changed" } & AgentFileChange)
  | { type: "approval_requested"; approval: AgentApproval }
  | { type: "approval_resolved"; approvalId: string }
  | { type: "turn_completed"; turnId: string }
  | { type: "backend_event"; event: string; payload: unknown }
  | { type: "error"; message: string };

/**
 * Event as it arrives over the Tauri wire — tagged with `sessionId` so the
 * frontend can route each event to the correct agent tab. The reducer accepts
 * the bare `AgentEvent` (a supertype) and ignores `sessionId`.
 */
export type RoutedAgentEvent = AgentEvent & { sessionId: string };

export function buildAgentSendPayload(
  sessionId: string,
  prompt: string,
  referenceText: string,
): { prompt: string; referenceText: string; sessionId: string } {
  return { prompt, referenceText, sessionId };
}

export interface AgentSessionState {
  approvals: AgentApproval[];
  /** Bounded diagnostic history of backend-specific ACP events. */
  backendEvents: AgentBackendEvent[];
  backendCapabilities?: AgentBackendCapabilities;
  backendConfig?: unknown;
  changedFiles: AgentFileChange[];
  error?: string;
  latestTouchedFile?: string;
  messages: AgentMessage[];
  reasoning: string;
  runtime?: AgentRuntimeKind;
  /** A restored transcript is offline until a new runtime is explicitly connected. */
  runtimeConnection: "offline" | "connected";
  runtimeContext?: "new" | "restored";
  sessionId?: string;
  status: AgentSessionStatus;
  tools: Record<string, AgentTool>;
  turnId?: string;
}

/**
 * Derived display status for a tab — computed from the durable session
 * facts (status, approvals, turnId) at read time, never stored separately.
 * Inspired by Agent Orchestrator's "durable facts, derived status" pattern.
 */
export type TabDisplayStatus =
  | "disconnected"
  | "connecting"
  | "idle"
  | "running"
  | "waiting"
  | "error";

export function deriveTabStatus(state: AgentSessionState): TabDisplayStatus {
  if (state.status === "error") return "error";
  if (state.status === "disconnected") return "disconnected";
  if (state.status === "connecting") return "connecting";
  // Waiting for approval takes priority over running — the agent is blocked.
  if (state.approvals.length > 0) return "waiting";
  if (state.status === "running") return "running";
  return "idle";
}

export function titleFromPrompt(text: string): string {
  const compact = text.replace(/\s+/g, " ").trim();
  if (!compact) return "New chat";
  const withoutPrefix = compact
    .replace(/^(please|can you|could you|would you)\s+/i, "")
    .replace(/[.!?]+$/, "");
  const title = withoutPrefix || compact;
  return title.length > 36 ? `${title.slice(0, 36).trimEnd()}…` : title;
}

export function isUntitledTab(title: string): boolean {
  return title === "New chat" || title === "Agent session" || /^Chat \d+$/.test(title);
}
