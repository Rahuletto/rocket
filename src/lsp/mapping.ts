import type { DiagnosticSnapshot, LspRange } from "./types";

export function toMonacoRange(range: LspRange) {
  return { startLineNumber: range.start.line + 1, startColumn: range.start.character + 1, endLineNumber: range.end.line + 1, endColumn: range.end.character + 1 };
}

export function markerSeverity(monaco: any, severity = 1) {
  return ({ 1: monaco.MarkerSeverity.Error, 2: monaco.MarkerSeverity.Warning, 3: monaco.MarkerSeverity.Info, 4: monaco.MarkerSeverity.Hint } as Record<number, number>)[severity] ?? monaco.MarkerSeverity.Error;
}

export function applyMarkers(monaco: any, snapshot: DiagnosticSnapshot) {
  const model = monaco.editor.getModels().find((candidate: any) => candidate.uri.toString() === snapshot.uri);
  if (!model) return false;
  monaco.editor.setModelMarkers(model, "rocket-lsp", snapshot.diagnostics.map((diagnostic) => ({ ...toMonacoRange(diagnostic.range), message: diagnostic.message, code: diagnostic.code?.toString(), source: diagnostic.source, severity: markerSeverity(monaco, diagnostic.severity) })));
  return true;
}

export function navigationDetail(snapshot: DiagnosticSnapshot, index: number) {
  const diagnostic = snapshot.diagnostics[index];
  if (!diagnostic) return null;
  return { path: decodeURIComponent(snapshot.uri.replace(/^file:\/\//, "")), lineNumber: diagnostic.range.start.line + 1, start: diagnostic.range.start.character, end: diagnostic.range.end.character };
}
