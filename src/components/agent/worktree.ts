export type AgentWorkspaceMode = "current-workspace" | "isolated-worktree";
export const DEFAULT_AGENT_WORKSPACE_MODE: AgentWorkspaceMode = "current-workspace";

export interface WorktreeStatus {
  additions: number;
  baseRevision: string;
  branch: string;
  changedFiles: number;
  deletions: number;
  dirty: boolean;
  headRevision: string;
  path: string;
  repository: string;
}

export function worktreeSummary(status: WorktreeStatus): string {
  const state = status.dirty || status.changedFiles > 0 ? "Changes ready for review" : "No changes";
  return `${state} · ${status.changedFiles} files · +${status.additions} −${status.deletions}`;
}

export function canDiscard(status: WorktreeStatus, confirmed: boolean): boolean {
  return !status.dirty || confirmed;
}
