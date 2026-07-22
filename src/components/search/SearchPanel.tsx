import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { ChevronDown, ChevronRight, Eye, LoaderCircle, Search, StopCircle } from "lucide-react";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useSource } from "../../provider/SourceContext";
import { requestSearchNavigation } from "../../search/navigation";
import { groupSearchResults, type WorkspaceSearchMatch } from "../../search/results";
import "../../styles/search.css";

interface Finished { id: string; count: number; limited: boolean; error?: string }

export default function SearchPanel() {
  const { openFileByPath } = useSource();
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<WorkspaceSearchMatch[]>([]);
  const [running, setRunning] = useState(false);
  const [includeHidden, setIncludeHidden] = useState(false);
  const [limited, setLimited] = useState(false);
  const [error, setError] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const activeId = useRef("");
  const groups = useMemo(() => groupSearchResults(matches), [matches]);

  useEffect(() => {
    const unlistenMatch = listen<WorkspaceSearchMatch>("workspace-search-match", ({ payload }) => {
      if (payload.id === activeId.current) setMatches((current) => [...current, payload]);
    });
    const unlistenFinished = listen<Finished>("workspace-search-finished", ({ payload }) => {
      if (payload.id !== activeId.current) return;
      setRunning(false);
      setLimited(payload.limited);
      if (payload.error) setError(payload.error);
    });
    return () => { void unlistenMatch.then((fn) => fn()); void unlistenFinished.then((fn) => fn()); };
  }, []);

  useEffect(() => () => {
    if (activeId.current) void invoke("cancel_workspace_search", { id: activeId.current });
  }, []);

  async function search(event: FormEvent) {
    event.preventDefault();
    const workspace = localStorage.getItem("project");
    const text = query.trim();
    if (!workspace) { setError("Open a workspace to search."); return; }
    if (!text) return;
    if (activeId.current) await invoke("cancel_workspace_search", { id: activeId.current }).catch(() => {});
    const id = crypto.randomUUID();
    activeId.current = id;
    setMatches([]); setCollapsed(new Set()); setLimited(false); setError(""); setRunning(true);
    try {
      await invoke("search_workspace", { request: { id, workspace, query: text, includeHidden } });
    } catch (reason) { setRunning(false); setError(String(reason)); }
  }

  function cancel() {
    void invoke("cancel_workspace_search", { id: activeId.current });
    setRunning(false);
  }

  function openMatch(match: WorkspaceSearchMatch) {
    requestSearchNavigation(match);
    openFileByPath(match.path);
  }

  return <aside className="workspace-panel search-panel">
    <header className="workspace-panel-header"><h2>Search</h2></header>
    <form className="search-form" onSubmit={search}>
      <div className="search-input-row"><Search size={14} /><input autoFocus aria-label="Search workspace" onChange={(e) => setQuery(e.target.value)} placeholder="Search workspace" value={query} />
        {running ? <button aria-label="Cancel search" onClick={cancel} title="Cancel" type="button"><StopCircle size={15} /></button> : <button aria-label="Run search" title="Search" type="submit"><Search size={15} /></button>}
      </div>
      <label><input checked={includeHidden} onChange={(e) => setIncludeHidden(e.target.checked)} type="checkbox" /> Include hidden files</label>
    </form>
    <div aria-live="polite" className="search-summary">{running && <LoaderCircle className="search-spinner" size={13} />}{matches.length} result{matches.length === 1 ? "" : "s"} in {groups.length} file{groups.length === 1 ? "" : "s"}{limited ? " (limit reached)" : ""}</div>
    {error && <div className="search-error" role="alert">{error}</div>}
    <div className="search-results">
      {groups.map((group) => { const closed = collapsed.has(group.path); return <section className="search-group" key={group.path}>
        <button className="search-file" onClick={() => setCollapsed((current) => { const next = new Set(current); next.has(group.path) ? next.delete(group.path) : next.add(group.path); return next; })} type="button">
          {closed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}<span title={group.path}>{group.path}</span><b>{group.matches.length}</b>
        </button>
        {!closed && group.matches.map((match, index) => <button className="search-match" key={`${match.lineNumber}-${match.start}-${index}`} onClick={() => openMatch(match)} title={`${match.path}:${match.lineNumber}`} type="button">
          <span>{match.lineNumber}</span><code>{match.line || " "}</code><Eye size={12} />
        </button>)}
      </section>; })}
    </div>
  </aside>;
}
