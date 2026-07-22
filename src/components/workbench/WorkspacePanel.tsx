import GitPanel from "../git/GitPanel";
import Sidebar from "../Sidebar";
import { useWorkbench } from "../../provider/WorkbenchContext";
import { Files, GitBranch, Search, X } from "lucide-react";
import { useGit } from "../../provider/GitContext";
import SearchPanel from "../search/SearchPanel";

export default function WorkspacePanel() {
  const { files } = useGit();
  const { activeView, setActiveView, setNavigatorOpen } = useWorkbench();
  return (
    <section className="workspace-region">
      <header className="workspace-region-header">
        <div role="tablist">
          <button
            aria-label="Files"
            aria-selected={activeView === "explorer"}
            className={activeView === "explorer" ? "active" : ""}
            onClick={() => setActiveView("explorer")}
            role="tab"
            title="Files"
            type="button"
          >
            <Files size={15} />
          </button>
          <button
            aria-label="Search"
            aria-selected={activeView === "search"}
            className={activeView === "search" ? "active" : ""}
            onClick={() => setActiveView("search")}
            role="tab"
            title="Search"
            type="button"
          >
            <Search size={15} />
          </button>
          <button
            aria-label="Git"
            aria-selected={activeView === "git"}
            className={activeView === "git" ? "active" : ""}
            onClick={() => setActiveView("git")}
            role="tab"
            title="Git"
            type="button"
          >
            <GitBranch size={15} />
            {files.length > 0 && <span>{files.length}</span>}
          </button>
        </div>
        <button
          aria-label="Close navigator"
          onClick={() => setNavigatorOpen(false)}
          title="Close navigator"
          type="button"
        >
          <X size={14} />
        </button>
      </header>
      <div className="workspace-region-content">
        {activeView === "git" ? <GitPanel /> : activeView === "search" ? <SearchPanel /> : <Sidebar />}
      </div>
    </section>
  );
}
