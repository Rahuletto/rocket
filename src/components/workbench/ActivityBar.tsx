import { Bot, Files, GitBranch, Search, TerminalSquare } from "lucide-react";
import { useGit } from "../../provider/GitContext";
import { useWorkbench } from "../../provider/WorkbenchContext";

export default function ActivityBar() {
  const { files } = useGit();
  const {
    activeView,
    agentOpen,
    navigatorOpen,
    terminalOpen,
    toggleAgent,
    toggleNavigator,
    toggleTerminal,
  } = useWorkbench();

  return (
    <nav aria-label="Workbench views" className="activity-bar">
      <div className="activity-bar-main">
        <button
          aria-label="Explorer"
          aria-pressed={activeView === "explorer"}
          className={
            navigatorOpen && activeView === "explorer" ? "active" : ""
          }
          onClick={() => toggleNavigator("explorer")}
          title="Explorer"
          type="button"
        >
          <Files size={19} />
        </button>
        <button
          aria-label="Source Control"
          aria-pressed={activeView === "git"}
          className={navigatorOpen && activeView === "git" ? "active" : ""}
          onClick={() => toggleNavigator("git")}
          title="Source Control"
          type="button"
        >
          <GitBranch size={19} />
          {files.length > 0 && <span className="activity-badge">{files.length}</span>}
        </button>
        <button aria-label="Search" disabled title="Search" type="button">
          <Search size={19} />
        </button>
        <button
          aria-label="Toggle agent"
          aria-pressed={agentOpen}
          className={agentOpen ? "active" : ""}
          onClick={toggleAgent}
          title="Agent"
          type="button"
        >
          <Bot size={19} />
        </button>
      </div>
      <button
        aria-label="Toggle terminal"
        aria-pressed={terminalOpen}
        className={terminalOpen ? "active" : ""}
        onClick={toggleTerminal}
        title="Terminal"
        type="button"
      >
        <TerminalSquare size={19} />
      </button>
    </nav>
  );
}
