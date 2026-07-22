import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { DiagnosticSnapshot, LspStatus } from "../lsp/types";
import { useSource } from "./SourceContext";

interface LspContextValue { diagnostics: DiagnosticSnapshot[]; status: LspStatus; restart: () => Promise<void>; logs: string[] }
const initialStatus: LspStatus = { language: "typescript-javascript", state: "stopped", command: "typescript-language-server --stdio", message: "Language server is not running", capabilities: null };
const LspContext = createContext<LspContextValue | null>(null);

export function LspProvider({ children }: { children: ReactNode }) {
  const [diagnostics, setDiagnostics] = useState<DiagnosticSnapshot[]>([]);
  const [status, setStatus] = useState(initialStatus);
  const [logs, setLogs] = useState<string[]>([]);
  const { projectName } = useSource();
  const root = projectName || localStorage.getItem("project");
  const start = async (restart = false) => {
    if (!root) return;
    try { setStatus(await invoke(restart ? "lsp_restart" : "lsp_start", { rootPath: root })); }
    catch (error) { setStatus({ ...initialStatus, state: "error", message: String(error) }); }
  };
  useEffect(() => {
    const statusListener = listen<LspStatus>("lsp-status", ({ payload }) => setStatus(payload));
    const diagnosticListener = listen<DiagnosticSnapshot>("lsp-diagnostics", ({ payload }) => setDiagnostics((current) => [...current.filter((item) => item.uri !== payload.uri), payload]));
    const logListener = listen<string>("lsp-log", ({ payload }) => setLogs((current) => [...current.slice(-199), payload]));
    void start();
    return () => { void statusListener.then((dispose) => dispose()); void diagnosticListener.then((dispose) => dispose()); void logListener.then((dispose) => dispose()); void invoke("lsp_stop"); };
  }, [root]);
  const value = useMemo(() => ({ diagnostics, status, logs, restart: () => start(true) }), [diagnostics, status, logs, root]);
  return <LspContext.Provider value={value}>{children}</LspContext.Provider>;
}
export function useLsp() { const value = useContext(LspContext); if (!value) throw new Error("useLsp must be used inside LspProvider"); return value; }
