import {
  Check,
  ChevronRight,
  GitCommitHorizontal,
  Minus,
  Plus,
  RefreshCw,
} from "lucide-react";
import { useMemo, useState } from "react";
import type { GitFileStatus } from "../../provider/GitContext";
import { useGit } from "../../provider/GitContext";
import { useReview } from "../../provider/ReviewContext";
import { buildGitGraph, type GitGraphRow } from "./gitGraph";

type GitTab = "changes" | "history";

function statusLabel(file: GitFileStatus) {
  const value =
    file.workingTreeStatus !== " " ? file.workingTreeStatus : file.indexStatus;
  if (value === "?") return "U";
  return value || "M";
}

function timeAgo(value: string) {
  const seconds = Math.max(
    0,
    Math.floor((Date.now() - new Date(value).getTime()) / 1000),
  );
  if (seconds < 60) return "now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

export default function GitPanel() {
  const {
    branch,
    commit,
    commits,
    diff,
    error,
    files,
    isRepository,
    loading,
    refresh,
    showCommit,
    stage,
    unstage,
  } = useGit();
  const { openReview } = useReview();
  const [tab, setTab] = useState<GitTab>("changes");
  const [message, setMessage] = useState("");
  const [interactionError, setInteractionError] = useState("");
  const graph = useMemo(() => buildGitGraph(commits), [commits]);
  const staged = useMemo(
    () => files.filter((file) => file.indexStatus !== " " && file.indexStatus !== "?"),
    [files],
  );
  const unstaged = useMemo(
    () =>
      files.filter(
        (file) => file.workingTreeStatus !== " " || file.indexStatus === "?",
      ),
    [files],
  );

  if (!isRepository) {
    return (
      <aside className="workspace-panel git-panel">
        <PanelHeader loading={loading} refresh={refresh} />
        <div className="git-empty">
          <GitCommitHorizontal size={24} />
          <strong>No Git repository</strong>
          <span>Initialize Git from terminal to enable source control.</span>
        </div>
      </aside>
    );
  }

  return (
    <aside className="workspace-panel git-panel">
      <div className="git-repo-row">
        <span>{branch || "HEAD"}</span>
        <div>
          <span>{files.length} changes</span>
          <button
            aria-label="Refresh Git"
            onClick={refresh}
            title="Refresh"
            type="button"
          >
            <RefreshCw className={loading ? "agent-spinner" : ""} size={13} />
          </button>
        </div>
      </div>
      <div className="git-tabs">
        <button
          className={tab === "changes" ? "active" : ""}
          onClick={() => setTab("changes")}
          type="button"
        >
          Changes
        </button>
        <button
          className={tab === "history" ? "active" : ""}
          onClick={() => setTab("history")}
          type="button"
        >
          Graph
        </button>
      </div>

      {tab === "changes" ? (
        <div className="git-changes-view">
          <div className="git-commit-box">
            <textarea
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Commit message"
              rows={3}
              value={message}
            />
            <button
              disabled={!message.trim() || staged.length === 0}
              onClick={async () => {
                await commit(message);
                setMessage("");
              }}
              type="button"
            >
              <Check size={14} />
              Commit
            </button>
          </div>
          <GitSection
            actionIcon={Minus}
            actionLabel="Unstage all"
            files={staged}
            onAction={() => unstage(staged.map((file) => file.path))}
            onFileAction={(path) => unstage([path])}
            onOpen={async (file) => {
              try {
                const patch = await diff(file.path, true);
                openReview({
                  files: [{ patch, path: file.path }],
                  source: "git",
                  title: file.path,
                });
                setInteractionError("");
              } catch (diffError) {
                setInteractionError(String(diffError));
              }
            }}
            title="Staged Changes"
          />
          <GitSection
            actionIcon={Plus}
            actionLabel="Stage all"
            files={unstaged}
            onAction={() => stage(unstaged.map((file) => file.path))}
            onFileAction={(path) => stage([path])}
            onOpen={async (file) => {
              try {
                const patch = await diff(file.path, false);
                openReview({
                  files: [{ patch, path: file.path }],
                  source: "git",
                  title: file.path,
                });
                setInteractionError("");
              } catch (diffError) {
                setInteractionError(String(diffError));
              }
            }}
            title="Changes"
          />
          {files.length === 0 && (
            <div className="git-clean">
              <Check size={16} />
              Working tree clean
            </div>
          )}
          {error && <div className="agent-error">{error}</div>}
          {interactionError && (
            <div className="agent-error">{interactionError}</div>
          )}
        </div>
      ) : (
        <div className="git-history">
          {commits.map((item, index) => (
            <button
              className="git-commit-row"
              key={item.hash}
              onClick={async () => {
                try {
                  const patch = await showCommit(item.hash);
                  openReview({
                    files: [{ patch, path: item.shortHash }],
                    source: "git",
                    title: item.message,
                  });
                  setInteractionError("");
                } catch (showError) {
                  setInteractionError(String(showError));
                }
              }}
              type="button"
            >
              <GitGraphCell row={graph[index]} />
              <span className="git-commit-content">
                <span className="git-commit-message">{item.message}</span>
                {item.refs.length > 0 && (
                  <span className="git-refs">
                    {item.refs.slice(0, 2).map((ref) => (
                      <em key={ref}>{ref.replace("HEAD -> ", "")}</em>
                    ))}
                  </span>
                )}
                <span className="git-commit-meta">
                  {item.author} · {item.shortHash} · {timeAgo(item.date)}
                </span>
              </span>
            </button>
          ))}
          {interactionError && (
            <div className="agent-error">{interactionError}</div>
          )}
        </div>
      )}
    </aside>
  );
}

function PanelHeader({
  loading,
  refresh,
}: {
  loading: boolean;
  refresh: () => void;
}) {
  return (
    <header className="workspace-panel-header">
      <h2>Source Control</h2>
      <button aria-label="Refresh Git" onClick={refresh} title="Refresh" type="button">
        <RefreshCw className={loading ? "agent-spinner" : ""} size={14} />
      </button>
    </header>
  );
}

function GitSection({
  actionIcon: ActionIcon,
  actionLabel,
  files,
  onAction,
  onFileAction,
  onOpen,
  title,
}: {
  actionIcon: typeof Plus;
  actionLabel: string;
  files: GitFileStatus[];
  onAction: () => void;
  onFileAction: (path: string) => void;
  onOpen: (file: GitFileStatus) => void;
  title: string;
}) {
  if (files.length === 0) return null;
  return (
    <section className="git-section">
      <header>
        <span>
          <ChevronRight size={13} />
          {title}
          <small>{files.length}</small>
        </span>
        <button aria-label={actionLabel} onClick={onAction} title={actionLabel} type="button">
          <ActionIcon size={13} />
        </button>
      </header>
      {files.map((file) => (
        <div className="git-file-row" key={`${title}-${file.path}`}>
          <button onClick={() => onOpen(file)} title={file.path} type="button">
            <span>{file.path.split("/").pop()}</span>
            <small>{file.path.includes("/") ? file.path.slice(0, file.path.lastIndexOf("/")) : ""}</small>
          </button>
          <strong data-status={statusLabel(file)}>{statusLabel(file)}</strong>
          <button
            aria-label={`${actionLabel}: ${file.path}`}
            onClick={() => onFileAction(file.path)}
            title={actionLabel}
            type="button"
          >
            <ActionIcon size={12} />
          </button>
        </div>
      ))}
    </section>
  );
}

function GitGraphCell({ row }: { row: GitGraphRow }) {
  const gap = 14;
  const inset = 8;
  const height = 50;
  const width = inset * 2 + row.laneCount * gap;
  const x = (lane: number) => inset + lane * gap;

  return (
    <svg
      aria-hidden="true"
      className="git-graph"
      height={height}
      style={{ width }}
      viewBox={`0 0 ${width} ${height}`}
    >
      {row.edges.map((edge, index) => (
        <path
          className={edge.kind}
          d={`M ${x(edge.from)} ${edge.kind === "commit" ? 16 : 0} C ${x(edge.from)} 27, ${x(edge.to)} 29, ${x(edge.to)} ${height}`}
          key={`${edge.from}-${edge.to}-${edge.kind}-${index}`}
        />
      ))}
      <line
        className="incoming"
        x1={x(row.nodeLane)}
        x2={x(row.nodeLane)}
        y1="0"
        y2="10"
      />
      <circle cx={x(row.nodeLane)} cy="15" r="4" />
    </svg>
  );
}
