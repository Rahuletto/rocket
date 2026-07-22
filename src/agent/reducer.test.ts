import { describe, expect, it } from "vitest";
import { agentSessionReducer, initialAgentSessionState } from "./reducer";
import type { AgentEvent } from "./protocol";

describe("agentSessionReducer", () => {
  it("routes startup and update backend events without losing state", () => {
    const ready = agentSessionReducer(initialAgentSessionState, { type: "session_ready", runtime: "acp", sessionId: "tab-1" });
    const capabilities = { backendId: "acp-v1", raw: { session: { configOptions: [{ id: "model" }] } } };
    const started = agentSessionReducer(ready, { type: "backend_event", event: "capabilities", payload: capabilities });
    const updated = agentSessionReducer(started, { type: "backend_event", event: "config_option_update", payload: { update: { currentValue: "fast" } } });
    const future = agentSessionReducer(updated, { type: "future_event", value: true } as unknown as AgentEvent);

    expect(updated.backendCapabilities).toEqual(capabilities);
    expect(updated.backendConfig).toEqual({ update: { currentValue: "fast" } });
    expect(updated.backendEvents.map((event) => event.event)).toEqual(["capabilities", "config_option_update"]);
    expect(future).toBe(updated);
    expect(future.status).toBe("idle");
  });

  it("accumulates streaming assistant text into one message", () => {
    const started = agentSessionReducer(initialAgentSessionState, {
      type: "turn_started",
      turnId: "turn-1",
    });
    const first = agentSessionReducer(started, {
      type: "message_delta",
      messageId: "message-1",
      text: "Working ",
    });
    const second = agentSessionReducer(first, {
      type: "message_delta",
      messageId: "message-1",
      text: "on it.",
    });

    expect(second.messages).toEqual([
      {
        id: "message-1",
        role: "assistant",
        status: "streaming",
        text: "Working on it.",
      },
    ]);
  });

  it("tracks tool lifecycle and streamed output", () => {
    const started = agentSessionReducer(initialAgentSessionState, {
      type: "tool_started",
      tool: {
        id: "tool-1",
        kind: "command",
        label: "bun test",
        status: "running",
      },
    });
    const streamed = agentSessionReducer(started, {
      type: "tool_output",
      output: "1 pass\n",
      toolId: "tool-1",
    });
    const completed = agentSessionReducer(streamed, {
      type: "tool_completed",
      status: "completed",
      toolId: "tool-1",
    });

    expect(completed.tools["tool-1"]).toMatchObject({
      output: "1 pass\n",
      status: "completed",
    });
  });

  it("records changed files and exposes latest touched file", () => {
    const state = agentSessionReducer(initialAgentSessionState, {
      type: "file_changed",
      additions: 4,
      deletions: 1,
      path: "/workspace/src/App.tsx",
      toolId: "tool-2",
    });

    expect(state.changedFiles).toEqual([
      {
        additions: 4,
        deletions: 1,
        path: "/workspace/src/App.tsx",
        toolId: "tool-2",
      },
    ]);
    expect(state.latestTouchedFile).toBe("/workspace/src/App.tsx");
  });

  it("queues approval requests until resolved", () => {
    const requested = agentSessionReducer(initialAgentSessionState, {
      type: "approval_requested",
      approval: {
        description: "Run cargo test",
        id: "approval-1",
        kind: "command",
      },
    });
    const resolved = agentSessionReducer(requested, {
      type: "approval_resolved",
      approvalId: "approval-1",
    });

    expect(requested.approvals).toHaveLength(1);
    expect(resolved.approvals).toHaveLength(0);
  });

  it("marks streaming messages complete when turn ends", () => {
    const streaming = agentSessionReducer(initialAgentSessionState, {
      type: "message_delta",
      messageId: "message-1",
      text: "Done.",
    });
    const completed = agentSessionReducer(streaming, {
      type: "turn_completed",
      turnId: "turn-1",
    });

    expect(completed.status).toBe("idle");
    expect(completed.messages[0]?.status).toBe("complete");
  });

  it("adds host command output without changing connection state", () => {
    const state = agentSessionReducer(initialAgentSessionState, {
      type: "host_message",
      messageId: "host-1",
      text: "/help output",
    });

    expect(state.status).toBe("disconnected");
    expect(state.messages).toEqual([
      {
        id: "host-1",
        role: "assistant",
        status: "complete",
        text: "/help output",
      },
    ]);
  });
});
