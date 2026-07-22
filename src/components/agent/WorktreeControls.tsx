import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { worktreeSummary, type WorktreeStatus } from "./worktree";

export default function WorktreeControls({ sessionId, onDiscard }: { sessionId: string; onDiscard: () => void | Promise<void> }) {
  const [status, setStatus] = useState<WorktreeStatus>();
  const [diff, setDiff] = useState("");
  const refresh = () => invoke<WorktreeStatus>("agent_worktree_status", { sessionId }).then(setStatus).catch((error) => alert(String(error)));
  useEffect(() => { void refresh(); }, [sessionId]);
  if (!status) return <div className="agent-worktree-status">Loading isolated worktree…</div>;
  const open = () => { localStorage.setItem("project", status.path); window.dispatchEvent(new Event("rocket-workspace-changed")); };
  return <section className="agent-worktree-status" aria-label="Isolated worktree status">
    <strong>{status.branch}</strong><span>{worktreeSummary(status)}</span>
    <div className="agent-worktree-actions">
      <button type="button" onClick={() => void invoke<string>("agent_worktree_diff", { sessionId }).then(setDiff).catch((error) => alert(String(error)))}>Review</button>
      <button type="button" onClick={open}>Open</button>
      <button type="button" onClick={() => { if (confirm("Apply these reviewed changes to the current workspace?")) void invoke("agent_worktree_apply", { sessionId }).then(refresh).catch((error) => alert(String(error))); }}>Apply</button>
      <button type="button" onClick={async () => { if (!confirm("Permanently discard this isolated worktree and all of its changes?")) return; try { await invoke("agent_worktree_discard", { sessionId }); await onDiscard(); } catch (error) { alert(String(error)); } }}>Discard</button>
    </div>
    {diff && <pre className="agent-worktree-diff" tabIndex={0}>{diff}</pre>}
  </section>;
}
