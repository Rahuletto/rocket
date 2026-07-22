import { useEffect, useMemo, useState, useRef } from "react";
import MonacoEditor from "@monaco-editor/react";
import { getFileObject } from "../stores/file";
import { readFile, writeFile } from "../helpers/filesys";
import { Languages } from "../types/Languages";
import { IoWarning } from "react-icons/io5";
import { ArrowUp, ChevronDown, Sparkles, X } from "lucide-react";
import { findModel } from "../agent/providers/catalog";
import ModelPicker from "../components/agent/ModelPicker";
import ComposerInput from "../components/agent/ComposerInput";
import { useAgent } from "../provider/AgentContext";
import { useWorkbench } from "../provider/WorkbenchContext";
import { takeSearchNavigation } from "../search/navigation";
import { documentEvent, registerLspProviders, syncMarkers } from "../lsp/monacoClient";
import { useLsp } from "../provider/LspContext";
import { invoke } from "@tauri-apps/api/core";
import { useSource } from "../provider/SourceContext";
import {
  getEditorContext,
  matchesChangedPath,
  setEditorContext,
  setEditorFlush,
  type EditorDiagnosticContext,
} from "../agent/editorContext";

interface Props {
  id: string;
  active: boolean;
  language: string;
}

const QUICK_ACTIONS = [
  { key: "edit", label: "Edit", prompt: "Edit this code: " },
  { key: "explain", label: "Explain", prompt: "Explain what this code does" },
  { key: "fix", label: "Fix", prompt: "Fix problems in this code" },
  { key: "refactor", label: "Refactor", prompt: "Refactor this code for clarity" },
] as const;

export default function CodeEditor({ id, active, language }: Props) {
  const visible = active ? "" : "hidden";

  const {
    send,
    activeTabId,
    modelId,
    setModelId,
  } = useAgent();
  const { setAgentOpen } = useWorkbench();
  const { selected } = useSource();
  const { diagnostics, status: lspStatus } = useLsp();
  const model = findModel(modelId);
  const modelLabel = model?.displayName ?? "Codex";
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [theme, setTheme] = useState("dark");
  const [editorInstance, setEditorInstance] = useState<any>(null);
  const [monacoInstance, setMonacoInstance] = useState<any>(null);
  const [chatVisible, setChatVisible] = useState(false);
  const [chatPosition, setChatPosition] = useState({ top: 0, left: 0, lineNumber: 1 });
  const [chatInput, setChatInput] = useState("");
  // Local picker state — the inline widget owns its own popover so it never
  // double-renders against the sidebar's shared `modelPickerOpen`.
  const [inlinePickerOpen, setInlinePickerOpen] = useState(false);
  const inlineInputRef = useRef<HTMLTextAreaElement>(null);
  const onTriggerInlineChatRef = useRef<() => void>(() => {});

  const revealSearchLocation = () => {
    if (!editorInstance) return;
    const file = getFileObject(id);
    if (!file) return;
    const location = takeSearchNavigation(file.path);
    if (!location) return;
    const range = {
      startLineNumber: location.lineNumber,
      endLineNumber: location.lineNumber,
      startColumn: location.start + 1,
      endColumn: location.end + 1,
    };
    editorInstance.setSelection(range);
    editorInstance.revealRangeInCenter(range);
    editorInstance.focus();
  };

  useEffect(() => {
    revealSearchLocation();
    const listener = () => revealSearchLocation();
    window.addEventListener("rocket-search-navigate", listener);
    return () => window.removeEventListener("rocket-search-navigate", listener);
  }, [editorInstance, id]);

  const triggerInlineChat = () => {
    if (!editorInstance) return;
    const position = editorInstance.getPosition();
    if (!position) return;
    
    setChatVisible((visible) => {
      if (!visible) {
        const top = editorInstance.getTopForLineNumber(position.lineNumber);
        const scrollTop = editorInstance.getScrollTop();
        let lh = 20;
        if (monacoInstance) {
          lh = editorInstance.getOption(monacoInstance.editor.EditorOption.lineHeight) || 20;
        } else {
          lh = editorInstance.getOption(51) || 20;
        }
        const contentLeft = editorInstance.getLayoutInfo().contentLeft;
        
        setChatPosition({
          top: top - scrollTop + lh,
          left: contentLeft,
          lineNumber: position.lineNumber,
        });
        setChatInput("");
      }
      return !visible;
    });
  };

  useEffect(() => {
    onTriggerInlineChatRef.current = triggerInlineChat;
  }, [editorInstance, monacoInstance]);

  useEffect(() => {
    if (!editorInstance || !chatVisible) return;
    
    const disposable = editorInstance.onDidScrollChange(() => {
      const position = editorInstance.getPosition();
      if (!position) return;
      
      const top = editorInstance.getTopForLineNumber(chatPosition.lineNumber);
      const scrollTop = editorInstance.getScrollTop();
      let lh = 20;
      if (monacoInstance) {
        lh = editorInstance.getOption(monacoInstance.editor.EditorOption.lineHeight) || 20;
      } else {
        lh = editorInstance.getOption(51) || 20;
      }
      const contentLeft = editorInstance.getLayoutInfo().contentLeft;
      
      setChatPosition((prev) => ({
        ...prev,
        top: top - scrollTop + lh,
        left: contentLeft,
      }));
    });
    
    return () => {
      disposable.dispose();
    };
  }, [editorInstance, monacoInstance, chatVisible, chatPosition.lineNumber]);

  const handleSendChat = async () => {
    const text = chatInput.trim();
    if (!text) return;

    setChatVisible(false);
    setInlinePickerOpen(false);
    setAgentOpen(true);
    await send(text);
  };

  const applyQuickAction = (prompt: string) => {
    setChatInput(prompt);
    requestAnimationFrame(() => {
      const el = inlineInputRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(prompt.length, prompt.length);
    });
  };

  const editorLanguage = useMemo(
    () => Languages.find(({ name }) => name === language)?.name || "plaintext",
    [language],
  );

  const updateEditorContent = async (id: string) => {
    const file = getFileObject(id);
    if (!file) return;

    setError(null);
    try {
      setCode(await readFile(file.path));
    } catch (readError) {
      setCode(null);
      setError(String(readError));
    }
  };

  useEffect(() => {
    const onAgentFileChanged = (event: Event) => {
      const changedPath = (event as CustomEvent<{ path?: string }>).detail?.path;
      const file = getFileObject(id);
      const workspace = localStorage.getItem("project") ?? "";
      if (!changedPath || !file || file.kind !== "file") return;
      if (!matchesChangedPath(file.path, changedPath, workspace)) return;
      window.setTimeout(() => void updateEditorContent(id), 50);
    };
    window.addEventListener("rocket-agent-file-changed", onAgentFileChanged);
    return () =>
      window.removeEventListener("rocket-agent-file-changed", onAgentFileChanged);
  }, [id]);

  const onSave = async () => {
    const file = getFileObject(id);
    if (!file || file.kind !== "file" || code === null) return;
    try {
      await invoke("agent_user_edited_path", { sessionId: activeTabId, path: file.path }).catch(() => undefined);
      await writeFile(file.path, code);
      if (lspStatus.state === "running" && /^(typescript|javascript)/.test(editorLanguage)) {
        void documentEvent("Save", file.path, editorLanguage, undefined, code).catch((eventError) => setError(String(eventError)));
      }
      setError(null);
    } catch (writeError) {
      setError(String(writeError));
    }
  };

  useEffect(() => {
    if (selected !== id || code === null) return;
    setEditorFlush(id, onSave);
    return () => setEditorFlush(id, null);
  }, [code, id, selected]);

  useEffect(() => {
    updateEditorContent(id);
  }, [id]);

  useEffect(() => {
    const html = document.querySelector("html");
    const updateTheme = () =>
      setTheme(html?.getAttribute("data-theme") || "dark");
    updateTheme();

    const observer = new MutationObserver(updateTheme);
    if (html) {
      observer.observe(html, { attributeFilter: ["data-theme"] });
    }
    return () => observer.disconnect();
  }, []);

  function handleEditorWillMount(monaco: any) {
    registerLspProviders(monaco);
    monaco.editor.defineTheme("rocket-dark", {
      base: "vs-dark",
      inherit: true,
      rules: [
        { token: "comment", foreground: "747771", fontStyle: "italic" },
        { token: "keyword", foreground: "C792EA" },
        { token: "string", foreground: "D9A17A" },
        { token: "number", foreground: "A6D189" },
        { token: "type.identifier", foreground: "89B4C7" },
      ],
      colors: {
        "editor.background": "#171815",
        "editor.foreground": "#D8D8D3",
        "editor.lineHighlightBackground": "#FFFFFF07",
        "editor.selectionBackground": "#7B849933",
        "editor.inactiveSelectionBackground": "#7B84991F",
        "editorLineNumber.foreground": "#62645F",
        "editorLineNumber.activeForeground": "#B8B8B2",
        "editorGutter.background": "#171815",
        "editorIndentGuide.background1": "#FFFFFF0C",
        "editorIndentGuide.activeBackground1": "#FFFFFF20",
        "editorCursor.foreground": "#E5E4DF",
        "editorWhitespace.foreground": "#FFFFFF12",
        "editorOverviewRuler.border": "#00000000",
        "scrollbar.shadow": "#00000000",
      },
    });
    monaco.editor.defineTheme("rocket-light", {
      base: "vs",
      inherit: true,
      rules: [
        { token: "comment", foreground: "85877F", fontStyle: "italic" },
        { token: "keyword", foreground: "6E548B" },
        { token: "string", foreground: "9A5F3D" },
        { token: "number", foreground: "507A56" },
        { token: "type.identifier", foreground: "3D7080" },
      ],
      colors: {
        "editor.background": "#F4F4F1",
        "editor.foreground": "#30312D",
        "editor.lineHighlightBackground": "#1D211B08",
        "editor.selectionBackground": "#7D8A9B2B",
        "editor.inactiveSelectionBackground": "#7D8A9B18",
        "editorLineNumber.foreground": "#A1A29C",
        "editorLineNumber.activeForeground": "#565752",
        "editorGutter.background": "#F4F4F1",
        "editorIndentGuide.background1": "#20221D0C",
        "editorIndentGuide.activeBackground1": "#20221D22",
        "editorCursor.foreground": "#30312D",
        "editorWhitespace.foreground": "#20221D12",
        "editorOverviewRuler.border": "#00000000",
        "scrollbar.shadow": "#00000000",
      },
    });

    monaco.languages.typescript.javascriptDefaults.setCompilerOptions({
      target: monaco.languages.typescript.ScriptTarget.ES2016,
      allowNonTsExtensions: true,
      moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
      module: monaco.languages.typescript.ModuleKind.CommonJS,
      noEmit: false,
      typeRoots: ["node_modules/@types"],
      jsx: monaco.languages.typescript.JsxEmit.React,
      jsxFactory: "React.createElement",
    });

    monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
      target: monaco.languages.typescript.ScriptTarget.ES2016,
      allowNonTsExtensions: true,
      moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
      module: monaco.languages.typescript.ModuleKind.CommonJS,
      noEmit: false,
      typeRoots: ["node_modules/@types"],
      jsx: monaco.languages.typescript.JsxEmit.React,
      jsxFactory: "React.createElement",
    });

    monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
      noSemanticValidation: false,
      noSyntaxValidation: true,
    });
  }

  useEffect(() => {
    if (code === null) return;
    const timeoutId = setTimeout(() => onSave(), 1000);
    return () => clearTimeout(timeoutId);
  }, [code, id]);

  useEffect(() => {
    if (monacoInstance) syncMarkers(monacoInstance, diagnostics);
  }, [monacoInstance, diagnostics]);

  useEffect(() => {
    const file = getFileObject(id);
    const model = editorInstance?.getModel?.();
    if (!editorInstance || !monacoInstance || !model || !file || selected !== id) {
      return;
    }

    const publish = () => {
      const position = editorInstance.getPosition() ?? { lineNumber: 1, column: 1 };
      const selection = editorInstance.getSelection();
      const visible = editorInstance.getVisibleRanges?.()?.[0];
      const visibleStartLine = visible?.startLineNumber ?? position.lineNumber;
      const visibleEndLine = visible?.endLineNumber ?? position.lineNumber;
      const uri = model.uri.toString();
      const lspDiagnostics = diagnostics
        .filter((snapshot) => snapshot.uri === uri)
        .flatMap((snapshot) =>
          snapshot.diagnostics.map<EditorDiagnosticContext>((diagnostic) => ({
            column: diagnostic.range.start.character + 1,
            line: diagnostic.range.start.line + 1,
            message: diagnostic.message,
            severity:
              diagnostic.severity === 2
                ? "warning"
                : diagnostic.severity === 3
                  ? "info"
                  : diagnostic.severity === 4
                    ? "hint"
                    : "error",
          })),
        );
      const monacoDiagnostics: EditorDiagnosticContext[] = monacoInstance.editor
        .getModelMarkers({ resource: model.uri })
        .map((marker: any): EditorDiagnosticContext => ({
          column: marker.startColumn,
          line: marker.startLineNumber,
          message: marker.message,
          severity:
            marker.severity === monacoInstance.MarkerSeverity.Warning
              ? "warning"
              : marker.severity === monacoInstance.MarkerSeverity.Info
                ? "info"
                : marker.severity === monacoInstance.MarkerSeverity.Hint
                  ? "hint"
                  : "error",
        }));
      const hasSelection = selection && !selection.isEmpty();
      setEditorContext({
        cursor: { column: position.column, line: position.lineNumber },
        diagnostics: lspDiagnostics.length > 0 ? lspDiagnostics : monacoDiagnostics,
        language: editorLanguage,
        path: file.path,
        selection: hasSelection
          ? {
              endColumn: selection.endColumn,
              endLine: selection.endLineNumber,
              startColumn: selection.startColumn,
              startLine: selection.startLineNumber,
              text: model.getValueInRange(selection),
            }
          : undefined,
        visibleStartLine,
        visibleText: model.getValueInRange({
          endColumn: model.getLineMaxColumn(visibleEndLine),
          endLineNumber: visibleEndLine,
          startColumn: 1,
          startLineNumber: visibleStartLine,
        }),
      });
    };

    publish();
    const disposables = [
      editorInstance.onDidChangeCursorSelection(publish),
      editorInstance.onDidScrollChange(publish),
      model.onDidChangeContent(publish),
    ];
    return () => {
      disposables.forEach((disposable: { dispose: () => void }) => disposable.dispose());
      if (getEditorContext()?.path === file.path) setEditorContext(null);
    };
  }, [diagnostics, editorInstance, editorLanguage, id, monacoInstance, selected]);

  useEffect(() => {
    const file = getFileObject(id);
    if (!file || code === null || lspStatus.state !== "running" || !/^(typescript|javascript)/.test(editorLanguage)) return;
    void documentEvent("Open", file.path, editorLanguage, 1, code).catch((eventError) => setError(String(eventError)));
    return () => { void documentEvent("Close", file.path).catch(() => undefined); };
  }, [id, lspStatus.state]);

  useEffect(() => {
    const file = getFileObject(id);
    if (!file || code === null || lspStatus.state !== "running" || !/^(typescript|javascript)/.test(editorLanguage)) return;
    const timeout = window.setTimeout(() => {
      void documentEvent("Change", file.path, editorLanguage, Date.now(), code).catch((eventError) => setError(String(eventError)));
    }, 150);
    return () => window.clearTimeout(timeout);
  }, [code, id, lspStatus.state, editorLanguage]);

  return (
    <main
      className={`code-editor ${visible}`}
    >
      {code !== null && !error && (
        <>
          <MonacoEditor
              path={getFileObject(id)?.path ?? id}
              defaultLanguage={editorLanguage}
              theme={theme === "dark" ? "rocket-dark" : "rocket-light"}
              value={code}
              options={{
                acceptSuggestionOnCommitCharacter: true,
                accessibilitySupport: "auto",
                automaticLayout: true,
                codeLens: true,
                colorDecorators: true,
                contextmenu: true,
                cursorBlinking: "blink",
                cursorSmoothCaretAnimation: "off",
                cursorStyle: "line",
                disableLayerHinting: false,
                disableMonospaceOptimizations: false,
                dragAndDrop: false,
                fixedOverflowWidgets: false,
                folding: true,
                foldingStrategy: "auto",
                fontLigatures: true,
                formatOnPaste: true,
                formatOnType: false,
                hideCursorInOverviewRuler: false,
                links: true,
                mouseWheelZoom: false,
                multiCursorMergeOverlapping: true,
                multiCursorModifier: "alt",
                overviewRulerBorder: false,
                overviewRulerLanes: 0,
                quickSuggestions: true,
                quickSuggestionsDelay: 100,
                readOnly: false,
                renderControlCharacters: false,
                renderFinalNewline: "on",
                renderLineHighlight: "all",
                renderWhitespace: "none",
                revealHorizontalRightPadding: 30,
                roundedSelection: true,
                scrollBeyondLastColumn: 5,
                scrollBeyondLastLine: false,
                selectOnLineNumbers: true,
                selectionClipboard: true,
                selectionHighlight: true,
                showFoldingControls: "mouseover",
                smoothScrolling: false,
                suggestOnTriggerCharacters: true,
                wordBasedSuggestions: "allDocuments",
                wordSeparators: "~!@#$%^&*()-=+[{]}|;:'\",.<>/?",
                wordWrap: "off",
                wordWrapBreakAfterCharacters: "\t})]?|&,;",
                wordWrapBreakBeforeCharacters: "{([+",
                wordWrapColumn: 80,
                wrappingIndent: "none",
                minimap: {
                  enabled: false,
                },
                scrollbar: {
                  useShadows: false,
                  verticalHasArrows: false,
                  horizontalHasArrows: false,
                  vertical: "visible",
                  horizontal: "auto",
                  verticalScrollbarSize: 12,
                  horizontalScrollbarSize: 12,
                  arrowSize: 0,
                },
              }}
              onChange={(value) => setCode(value || "")}
              beforeMount={handleEditorWillMount}
              onMount={(editor, monaco) => {
                setEditorInstance(editor);
                setMonacoInstance(monaco);
                
                editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Slash, () => {
                  onTriggerInlineChatRef.current();
                });
              }}
          />
          {chatVisible && (
            <div
              className="inline-chat-container"
              style={{
                position: "absolute",
                top: `${chatPosition.top}px`,
                left: `${chatPosition.left}px`,
                zIndex: 100,
              }}
              onWheel={(e) => e.stopPropagation()}
            >
              <div className="inline-chat-box" role="dialog" aria-label="Inline AI chat">
                <div className="inline-chat-header">
                  <span className="inline-chat-scope">
                    <Sparkles size={11} />
                    {id.split("/").pop()} · L{chatPosition.lineNumber}
                  </span>
                  <button
                    aria-label="Close inline chat"
                    className="inline-chat-close"
                    onClick={() => setChatVisible(false)}
                    type="button"
                  >
                    <X size={13} />
                  </button>
                </div>
                <div className="inline-chat-quick">
                  {QUICK_ACTIONS.map((action) => (
                    <button
                      key={action.key}
                      onClick={() => applyQuickAction(action.prompt)}
                      type="button"
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
                <ComposerInput
                  aria-label="Inline AI prompt"
                  autoFocus
                  className="inline-chat-input"
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void handleSendChat();
                    } else if (e.key === "Escape") {
                      e.preventDefault();
                      setChatVisible(false);
                    }
                  }}
                  placeholder="Ask, edit, or explain…"
                  ref={inlineInputRef}
                  value={chatInput}
                />
                <div className="inline-chat-footer">
                  <button
                    aria-label="Select model"
                    className="inline-chat-model"
                    onClick={() => setInlinePickerOpen((open) => !open)}
                    type="button"
                  >
                    {modelLabel}
                    <ChevronDown size={12} />
                  </button>
                  <div className="inline-chat-footer-right">
                    <span className="inline-chat-hint">esc to close</span>
                    <button
                  aria-label="Send to agent"
                  className="inline-chat-send"
                  disabled={!chatInput.trim()}
                  onClick={() => void handleSendChat()}
                  type="button"
                >
                  <ArrowUp size={14} strokeWidth={2.5} />
                </button>
                  </div>
                </div>
                {inlinePickerOpen && (
                  <ModelPicker
                    modelId={modelId}
                    onClose={() => setInlinePickerOpen(false)}
                    onSelect={(next) => {
                      setModelId(next.id);
                      setInlinePickerOpen(false);
                    }}
                  />
                )}
              </div>
            </div>
          )}
        </>
      )}
      {error && (
        <div className="flex flex-col items-center w-full h-full justify-center gap-2">
          <IoWarning size={72} color="var(--yellow)" />
          <h1 className="text-xl font-bold">Unable to open file</h1>
          <p className="max-w-[520px] text-center text-sm text-gray-400">
            {error}
          </p>
        </div>
      )}
    </main>
  );
}
