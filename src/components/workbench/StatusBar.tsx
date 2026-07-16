import {
  Braces,
  CheckCircle2,
  GitBranch,
  RefreshCw,
  TerminalSquare,
} from "lucide-react";
import { useGit } from "../../provider/GitContext";
import { useWorkbench } from "../../provider/WorkbenchContext";

export default function StatusBar() {
  const { ahead, behind, branch, files, isRepository, loading, refresh } =
    useGit();
  const { terminalOpen, toggleTerminal } = useWorkbench();

  return (
    <footer className="status-bar">
      <div className="status-group">
        <button
          className={terminalOpen ? "active" : ""}
          onClick={toggleTerminal}
          title="Toggle terminal"
          type="button"
        >
          <TerminalSquare size={12} />
          Terminal
        </button>
        {isRepository && (
          <button onClick={refresh} title="Refresh repository" type="button">
            <GitBranch size={12} />
            <span>{branch || "HEAD"}</span>
            {(ahead > 0 || behind > 0) && (
              <span className="status-sync">
                {behind > 0 && `↓${behind}`}
                {ahead > 0 && ` ↑${ahead}`}
              </span>
            )}
          </button>
        )}
        <span>
          <CheckCircle2 size={12} />
          {files.length === 0 ? "Clean" : `${files.length} changes`}
        </span>
      </div>
      <div className="status-group">
        {loading && <RefreshCw className="agent-spinner" size={12} />}
        <span>
          <Braces size={12} />
          Rocket
        </span>
      </div>
    </footer>
  );
}
