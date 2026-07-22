import { AlertCircle, RefreshCw } from "lucide-react";
import { useLsp } from "../../provider/LspContext";
import { useSource } from "../../provider/SourceContext";
import { navigationDetail } from "../../lsp/mapping";
import { requestSearchNavigation } from "../../search/navigation";
import { pathFromUri } from "../../lsp/types";

export default function ProblemsPanel() {
  const { diagnostics, status, restart, logs } = useLsp();
  const { openFileByPath } = useSource();
  const problems = diagnostics.flatMap((snapshot) => snapshot.diagnostics.map((diagnostic, index) => ({ snapshot, diagnostic, index })));
  const navigate = (snapshot: typeof diagnostics[number], index: number) => { const detail = navigationDetail(snapshot, index); if (!detail) return; requestSearchNavigation(detail); openFileByPath(detail.path); };
  return <section className="problems-panel" aria-label="Problems">
    <header><strong>Problems ({problems.length})</strong><span className={`lsp-state ${status.state}`}>{status.message}</span><button type="button" onClick={() => void restart()} title="Restart language server"><RefreshCw size={13} /> Restart</button></header>
    {status.state !== "running" && <div className="lsp-setup"><AlertCircle size={14} /> {status.message}</div>}
    <div className="problems-list">{problems.map(({ snapshot, diagnostic, index }) => <button type="button" key={`${snapshot.uri}-${index}`} onClick={() => navigate(snapshot, index)}><AlertCircle size={13} /><span>{diagnostic.message}</span><small>{pathFromUri(snapshot.uri).split("/").pop()}:{diagnostic.range.start.line + 1}:{diagnostic.range.start.character + 1}</small></button>)}{problems.length === 0 && status.state === "running" && <p>No TypeScript/JavaScript problems.</p>}</div>
    {status.state !== "running" && logs.length > 0 && <details><summary>Language server logs</summary><pre>{logs.slice(-20).join("\n")}</pre></details>}
  </section>;
}
