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
  | { type: "error"; message: string };

export interface AgentSessionState {
  approvals: AgentApproval[];
  changedFiles: AgentFileChange[];
  error?: string;
  latestTouchedFile?: string;
  messages: AgentMessage[];
  reasoning: string;
  runtime?: AgentRuntimeKind;
  sessionId?: string;
  status: AgentSessionStatus;
  tools: Record<string, AgentTool>;
  turnId?: string;
}
