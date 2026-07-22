import { invoke } from "@tauri-apps/api/core";
import type { DiagnosticSnapshot } from "./types";
import { applyMarkers } from "./mapping";

const supported = new Set(["typescript", "javascript", "typescriptreact", "javascriptreact"]);
const uri = (model: any) => model.uri.toString();
const position = (value: any) => ({ line: value.lineNumber - 1, character: value.column - 1 });
const request = (method: string, params: unknown) => invoke<any>("lsp_request", { method, params });
const location = (value: any) => value && ({ uri: { toString: () => value.uri }, range: { startLineNumber: value.range.start.line + 1, startColumn: value.range.start.character + 1, endLineNumber: value.range.end.line + 1, endColumn: value.range.end.character + 1 } });

const workspaceEdit = (monaco: any, value: any) => ({ edits: Object.entries(value?.changes ?? {}).flatMap(([resource, edits]) => (edits as any[]).map((edit) => ({ resource: monaco.Uri.parse(resource), textEdit: { range: location({ uri: resource, range: edit.range }).range, text: edit.newText }, versionId: undefined }))) });

let registered = false;
export function registerLspProviders(monaco: any) {
  if (registered) return;
  registered = true;
  for (const language of supported) {
    monaco.languages.registerCompletionItemProvider(language, { triggerCharacters: [".", "\"", "'", "/", "<"], provideCompletionItems: async (model: any, pos: any) => { const value = await request("textDocument/completion", { textDocument: { uri: uri(model) }, position: position(pos) }); const items = Array.isArray(value) ? value : value?.items ?? []; return { suggestions: items.map((item: any) => ({ label: item.label, detail: item.detail, documentation: item.documentation, insertText: item.insertText ?? item.label, kind: item.kind ?? monaco.languages.CompletionItemKind.Text, range: undefined })) }; } });
    monaco.languages.registerHoverProvider(language, { provideHover: async (model: any, pos: any) => { const value = await request("textDocument/hover", { textDocument: { uri: uri(model) }, position: position(pos) }); if (!value) return null; const contents = Array.isArray(value.contents) ? value.contents : [value.contents]; return { contents: contents.map((content: any) => ({ value: typeof content === "string" ? content : content.value ?? content })) }; } });
    monaco.languages.registerDefinitionProvider(language, { provideDefinition: async (model: any, pos: any) => { const value = await request("textDocument/definition", { textDocument: { uri: uri(model) }, position: position(pos) }); return (Array.isArray(value) ? value : value ? [value] : []).map(location); } });
    monaco.languages.registerReferenceProvider(language, { provideReferences: async (model: any, pos: any) => (await request("textDocument/references", { textDocument: { uri: uri(model) }, position: position(pos), context: { includeDeclaration: true } }) ?? []).map(location) });
    monaco.languages.registerRenameProvider(language, { provideRenameEdits: async (model: any, pos: any, newName: string) => workspaceEdit(monaco, await request("textDocument/rename", { textDocument: { uri: uri(model) }, position: position(pos), newName })) });
    monaco.languages.registerDocumentFormattingEditProvider(language, { provideDocumentFormattingEdits: async (model: any, options: any) => (await request("textDocument/formatting", { textDocument: { uri: uri(model) }, options }) ?? []).map((edit: any) => ({ range: location({ uri: uri(model), range: edit.range }).range, text: edit.newText })) });
    monaco.languages.registerCodeActionProvider(language, { provideCodeActions: async (model: any, range: any, context: any) => { const actions = await request("textDocument/codeAction", { textDocument: { uri: uri(model) }, range: { start: position({ lineNumber: range.startLineNumber, column: range.startColumn }), end: position({ lineNumber: range.endLineNumber, column: range.endColumn }) }, context: { diagnostics: context.markers } }) ?? []; return { actions: actions.map((action: any) => ({ title: action.title, kind: action.kind, diagnostics: context.markers, edit: action.edit ? workspaceEdit(monaco, action.edit) : undefined, command: action.command })), dispose() {} }; } });
  }
  if (typeof monaco.languages.registerWorkspaceSymbolProvider === "function") {
    monaco.languages.registerWorkspaceSymbolProvider({ provideWorkspaceSymbols: async (query: string) => (await request("workspace/symbol", { query }) ?? []).map((symbol: any) => ({ name: symbol.name, kind: symbol.kind, location: location(symbol.location), containerName: symbol.containerName })) });
  }
}

export async function documentEvent(kind: "Open" | "Change" | "Save" | "Close", path: string, languageId?: string, version?: number, text?: string) { return invoke("lsp_document_event", { kind, path, languageId, version, text }); }
export function syncMarkers(monaco: any, diagnostics: DiagnosticSnapshot[]) { diagnostics.forEach((snapshot) => applyMarkers(monaco, snapshot)); }
