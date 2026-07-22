import { describe, expect, it } from "vitest";
import {
  buildAgentSendPayload,
  deriveTabStatus,
  isUntitledTab,
  titleFromPrompt,
} from "./protocol";
import { agentSessionReducer } from "./reducer";
import { initialAgentSessionState } from "./reducer";

describe("deriveTabStatus", () => {
  it("returns disconnected for fresh state", () => {
    expect(deriveTabStatus(initialAgentSessionState)).toBe("disconnected");
  });

  it("returns connecting during session handshake", () => {
    const state = agentSessionReducer(initialAgentSessionState, {
      type: "session_connecting",
      runtime: "codex",
    });
    expect(deriveTabStatus(state)).toBe("connecting");
  });

  it("returns idle after session is ready", () => {
    const state = agentSessionReducer(initialAgentSessionState, {
      type: "session_ready",
      runtime: "codex",
      sessionId: "tab-1",
    });
    expect(deriveTabStatus(state)).toBe("idle");
  });

  it("returns running when a turn is active", () => {
    let state = agentSessionReducer(initialAgentSessionState, {
      type: "session_ready",
      runtime: "codex",
      sessionId: "tab-1",
    });
    state = agentSessionReducer(state, { type: "turn_started", turnId: "t-1" });
    expect(deriveTabStatus(state)).toBe("running");
  });

  it("returns waiting when an approval is pending (overrides running)", () => {
    let state = agentSessionReducer(initialAgentSessionState, {
      type: "session_ready",
      runtime: "codex",
      sessionId: "tab-1",
    });
    state = agentSessionReducer(state, { type: "turn_started", turnId: "t-1" });
    state = agentSessionReducer(state, {
      type: "approval_requested",
      approval: { id: "a-1", kind: "command", description: "Run tests" },
    });
    expect(deriveTabStatus(state)).toBe("waiting");
  });

  it("returns error when state has an error", () => {
    const state = agentSessionReducer(initialAgentSessionState, {
      type: "error",
      message: "Codex crashed",
    });
    expect(deriveTabStatus(state)).toBe("error");
  });

  it("returns idle after turn completes and approvals are resolved", () => {
    let state = agentSessionReducer(initialAgentSessionState, {
      type: "session_ready",
      runtime: "codex",
      sessionId: "tab-1",
    });
    state = agentSessionReducer(state, { type: "turn_started", turnId: "t-1" });
    state = agentSessionReducer(state, {
      type: "approval_requested",
      approval: { id: "a-1", kind: "command", description: "Run tests" },
    });
    state = agentSessionReducer(state, {
      type: "approval_resolved",
      approvalId: "a-1",
    });
    state = agentSessionReducer(state, {
      type: "turn_completed",
      turnId: "t-1",
    });
    expect(deriveTabStatus(state)).toBe("idle");
  });
});

describe("agent tab titles", () => {
  it("derives a concise title from the first prompt", () => {
    expect(titleFromPrompt("  Can you   fix the agent sidebar UI?  ")).toBe(
      "fix the agent sidebar UI",
    );
    expect(
      titleFromPrompt("Investigate why the workspace tools are failing after restart"),
    ).toBe("Investigate why the workspace tools…");
  });

  it("only replaces placeholder tab titles", () => {
    expect(isUntitledTab("Chat 3")).toBe(true);
    expect(isUntitledTab("New chat")).toBe(true);
    expect(isUntitledTab("Agent session")).toBe(true);
    expect(isUntitledTab("Fix agent sidebar")).toBe(false);
  });
});

describe("agent send payload", () => {
  it("keeps enriched prompt separate from original reference text", () => {
    expect(
      buildAgentSendPayload(
        "tab-1",
        "<rocket_editor_context>@not-a-reference</rocket_editor_context>\nOpen @src/App.tsx",
        "Open @src/App.tsx",
      ),
    ).toEqual({
      prompt:
        "<rocket_editor_context>@not-a-reference</rocket_editor_context>\nOpen @src/App.tsx",
      referenceText: "Open @src/App.tsx",
      sessionId: "tab-1",
    });
  });
});
