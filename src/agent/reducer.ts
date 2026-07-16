import type {
  AgentEvent,
  AgentMessage,
  AgentSessionState,
} from "./protocol";

export const initialAgentSessionState: AgentSessionState = {
  approvals: [],
  changedFiles: [],
  messages: [],
  reasoning: "",
  status: "disconnected",
  tools: {},
};

function appendAssistantDelta(
  messages: AgentMessage[],
  messageId: string,
  text: string,
): AgentMessage[] {
  const index = messages.findIndex((message) => message.id === messageId);
  if (index === -1) {
    return [
      ...messages,
      {
        id: messageId,
        role: "assistant",
        status: "streaming",
        text,
      },
    ];
  }

  return messages.map((message, messageIndex) =>
    messageIndex === index
      ? { ...message, status: "streaming", text: message.text + text }
      : message,
  );
}

export function agentSessionReducer(
  state: AgentSessionState,
  event: AgentEvent,
): AgentSessionState {
  switch (event.type) {
    case "session_connecting":
      return {
        ...state,
        error: undefined,
        runtime: event.runtime,
        status: "connecting",
      };
    case "session_ready":
      return {
        ...state,
        runtime: event.runtime,
        sessionId: event.sessionId,
        status: "idle",
      };
    case "turn_started":
      return {
        ...state,
        error: undefined,
        reasoning: "",
        status: "running",
        turnId: event.turnId,
      };
    case "user_message":
      return {
        ...state,
        messages: [
          ...state.messages,
          {
            id: event.messageId,
            role: "user",
            status: "complete",
            text: event.text,
          },
        ],
      };
    case "host_message":
      return {
        ...state,
        messages: [
          ...state.messages,
          {
            id: event.messageId,
            role: "assistant",
            status: "complete",
            text: event.text,
          },
        ],
      };
    case "message_delta":
      return {
        ...state,
        messages: appendAssistantDelta(
          state.messages,
          event.messageId,
          event.text,
        ),
      };
    case "reasoning_delta":
      return { ...state, reasoning: state.reasoning + event.text };
    case "tool_started":
      return {
        ...state,
        tools: { ...state.tools, [event.tool.id]: event.tool },
      };
    case "tool_output": {
      const tool = state.tools[event.toolId];
      if (!tool) return state;
      return {
        ...state,
        tools: {
          ...state.tools,
          [event.toolId]: {
            ...tool,
            output: (tool.output ?? "") + event.output,
          },
        },
      };
    }
    case "tool_completed": {
      const tool = state.tools[event.toolId];
      if (!tool) return state;
      return {
        ...state,
        tools: {
          ...state.tools,
          [event.toolId]: { ...tool, status: event.status },
        },
      };
    }
    case "file_touched":
      return { ...state, latestTouchedFile: event.path };
    case "file_changed": {
      const change = {
        additions: event.additions,
        deletions: event.deletions,
        path: event.path,
        toolId: event.toolId,
      };
      return {
        ...state,
        changedFiles: [
          ...state.changedFiles.filter((file) => file.path !== event.path),
          change,
        ],
        latestTouchedFile: event.path,
      };
    }
    case "approval_requested":
      return {
        ...state,
        approvals: [...state.approvals, event.approval],
      };
    case "approval_resolved":
      return {
        ...state,
        approvals: state.approvals.filter(
          (approval) => approval.id !== event.approvalId,
        ),
      };
    case "turn_completed":
      return {
        ...state,
        messages: state.messages.map((message) =>
          message.status === "streaming"
            ? { ...message, status: "complete" }
            : message,
        ),
        status: "idle",
        turnId: event.turnId,
      };
    case "error":
      return { ...state, error: event.message, status: "error" };
  }
}
