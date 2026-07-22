import { describe, expect, it } from "vitest";
import {
  canDiscard,
  DEFAULT_AGENT_WORKSPACE_MODE,
  worktreeSummary,
  type WorktreeStatus,
} from "./worktree";
const status: WorktreeStatus = { additions: 4, baseRevision: "abc", branch: "rocket/a", changedFiles: 2, deletions: 1, dirty: true, headRevision: "abc", path: "/tmp/a", repository: "/repo" };
describe("isolated agent actions", () => {
  it("uses the open workspace until worktree isolation is implemented", () => {
    expect(DEFAULT_AGENT_WORKSPACE_MODE).toBe("current-workspace");
  });
  it("shows review status", () => expect(worktreeSummary(status)).toContain("2 files · +4 −1"));
  it("requires confirmation before discarding dirty work", () => { expect(canDiscard(status, false)).toBe(false); expect(canDiscard(status, true)).toBe(true); });
});
