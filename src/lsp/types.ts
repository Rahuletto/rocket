export interface LspPosition { line: number; character: number }
export interface LspRange { start: LspPosition; end: LspPosition }
export interface LspDiagnostic {
  range: LspRange;
  severity?: 1 | 2 | 3 | 4;
  code?: string | number;
  source?: string;
  message: string;
}
export interface DiagnosticSnapshot { uri: string; diagnostics: LspDiagnostic[]; version?: number }
export interface LspStatus { language: string; state: "stopped" | "starting" | "running" | "unavailable" | "error"; command: string; message: string; capabilities: Record<string, unknown> | null }
export const fileUri = (path: string) => `file://${path.replaceAll(" ", "%20")}`;
export const pathFromUri = (uri: string) => decodeURIComponent(uri.replace(/^file:\/\//, ""));
