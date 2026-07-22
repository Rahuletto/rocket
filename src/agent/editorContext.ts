export interface EditorDiagnosticContext {
  column: number;
  line: number;
  message: string;
  severity: "error" | "warning" | "info" | "hint";
}

export interface EditorSelectionContext {
  endColumn: number;
  endLine: number;
  startColumn: number;
  startLine: number;
  text: string;
}

export interface EditorContextSnapshot {
  cursor: { column: number; line: number };
  diagnostics: EditorDiagnosticContext[];
  language: string;
  path: string;
  selection?: EditorSelectionContext;
  visibleStartLine: number;
  visibleText: string;
}

export interface AgentThreadContext {
  id: string;
  messages: Array<{ role: "assistant" | "user"; text: string }>;
  title: string;
}

export interface AgentPromptAttachments {
  threads: AgentThreadContext[];
}

const normalizePath = (value: string) =>
  value.replaceAll("\\", "/").replace(/\/+/g, "/").replace(/\/$/, "");

let currentEditorContext: EditorContextSnapshot | null = null;
const editorContextListeners = new Set<() => void>();
let editorFlush: { owner: string; run: () => Promise<void> } | null = null;

export function getEditorContext(): EditorContextSnapshot | null {
  return currentEditorContext;
}

export function setEditorContext(context: EditorContextSnapshot | null): void {
  currentEditorContext = context;
  editorContextListeners.forEach((listener) => listener());
}

export function subscribeEditorContext(listener: () => void): () => void {
  editorContextListeners.add(listener);
  return () => editorContextListeners.delete(listener);
}

export function setEditorFlush(
  owner: string,
  flush: (() => Promise<void>) | null,
): void {
  if (flush) {
    editorFlush = { owner, run: flush };
  } else if (editorFlush?.owner === owner) {
    editorFlush = null;
  }
}

export async function flushEditorContext(): Promise<void> {
  await editorFlush?.run();
}

export function buildAgentPrompt(
  request: string,
  context: EditorContextSnapshot | null,
  attachments?: AgentPromptAttachments,
): string {
  const threads = attachments?.threads ?? [];
  if (!context && threads.length === 0) return request;

  const sections: string[] = [];

  if (context) {
    const selection = context.selection;
    const source = (selection?.text ?? context.visibleText).slice(0, 12_000);
    const startLine = selection?.startLine ?? context.visibleStartLine;
    const numberedSource = source
      .split("\n")
      .map((line, index) => `${startLine + index} | ${line}`)
      .join("\n");
    const diagnostics = context.diagnostics
      .slice(0, 50)
      .map(
        (diagnostic) =>
          `${diagnostic.severity} ${diagnostic.line}:${diagnostic.column} ${diagnostic.message.replace(/\s+/g, " ").slice(0, 300)}`,
      )
      .join("\n");
    const selectionLine = selection
      ? `selection: ${selection.startLine}:${selection.startColumn}-${selection.endLine}:${selection.endColumn}`
      : `cursor: ${context.cursor.line}:${context.cursor.column}`;

    sections.push(`<rocket_editor_context>
file: ${context.path}
language: ${context.language}
${selectionLine}
editor_text:
${numberedSource || "(empty)"}
diagnostics:
${diagnostics || "none"}
</rocket_editor_context>`);
  }

  if (threads.length > 0) {
    const escapeAttribute = (value: string) =>
      value
        .replaceAll("&", "&amp;")
        .replaceAll('"', "&quot;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;");
    const threadText = threads
      .slice(0, 5)
      .map((thread) => {
        const transcript = thread.messages
          .slice(-40)
          .map(
            (message) =>
              `${message.role}: ${message.text.replace(/\s+/g, " ").trim()}`,
          )
          .join("\n")
          .slice(0, 12_000);
        return `<thread id="${escapeAttribute(thread.id)}" title="${escapeAttribute(thread.title)}">
${transcript || "(empty transcript)"}
</thread>`;
      })
      .join("\n");
    sections.push(`<rocket_thread_context>
${threadText}
</rocket_thread_context>`);
  }

  return `${sections.join("\n\n")}

<user_request>
${request}
</user_request>`;
}

export function matchesChangedPath(
  editorPath: string,
  changedPath: string,
  workspace: string,
): boolean {
  const editor = normalizePath(editorPath);
  const changed = normalizePath(changedPath);
  const absoluteChanged = changed.startsWith("/")
    ? changed
    : `${normalizePath(workspace)}/${changed.replace(/^\.\//, "")}`;
  return editor === absoluteChanged;
}

export function toWorkspaceRelativePath(path: string, workspace: string): string {
  const normalizedPath = normalizePath(path);
  const normalizedWorkspace = normalizePath(workspace);
  return normalizedPath.startsWith(`${normalizedWorkspace}/`)
    ? normalizedPath.slice(normalizedWorkspace.length + 1)
    : normalizedPath.replace(/^\.\//, "");
}
