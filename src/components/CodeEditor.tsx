import { useEffect, useMemo, useState, useRef } from "react";
import MonacoEditor from "@monaco-editor/react";
import { getFileObject } from "../stores/file";
import { readFile, writeFile } from "../helpers/filesys";
import { Languages } from "../types/Languages";
import { IoWarning } from "react-icons/io5";
import { ChevronDown } from "lucide-react";
import { findModel } from "../agent/providers/catalog";
import ModelPicker from "../components/agent/ModelPicker";
import ComposerInput from "../components/agent/ComposerInput";
import { useAgent } from "../provider/AgentContext";
import { useWorkbench } from "../provider/WorkbenchContext";

interface Props {
  id: string;
  active: boolean;
  language: string;
}

export default function CodeEditor({ id, active, language }: Props) {
  const visible = active ? "" : "hidden";

  const {
    send,
    modelId,
    setModelId,
    modelPickerOpen,
    setModelPickerOpen,
  } = useAgent();
  const { setAgentOpen } = useWorkbench();
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
  const onTriggerInlineChatRef = useRef<() => void>(() => {});

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
    setAgentOpen(true);
    
    const lines = (code || "").split("\n");
    const targetLine = chatPosition.lineNumber;
    const start = Math.max(0, targetLine - 8);
    const end = Math.min(lines.length, targetLine + 7);
    
    const contextLines = lines.slice(start, end).map((line, idx) => {
      const currentLineNum = start + idx + 1;
      const isTarget = currentLineNum === targetLine;
      return `${isTarget ? ">>> " : "    "}${currentLineNum}: ${line}`;
    }).join("\n");
    
    const fileName = id.split("/").pop() || id;
    const fullPrompt = `In file \`${fileName}\` around line ${targetLine}:
\`\`\`${editorLanguage}
${contextLines}
\`\`\`

User Request: ${text}`;

    await send(fullPrompt);
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

  const onSave = async () => {
    const file = getFileObject(id);
    if (!file || file.kind !== "file" || code === null) return;
    try {
      await writeFile(file.path, code);
      setError(null);
    } catch (writeError) {
      setError(String(writeError));
    }
  };

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

  return (
    <main
      className={`code-editor ${visible}`}
    >
      {code !== null && !error && (
        <>
          <MonacoEditor
              path={id}
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
              <div className="inline-chat-box">
                <div className="inline-chat-header">
                  <span>Line {chatPosition.lineNumber}</span>
                  <button
                    aria-label="Select model"
                    className="inline-chat-model"
                    onClick={() => setModelPickerOpen((open) => !open)}
                    type="button"
                  >
                    {modelLabel}
                    <ChevronDown size={12} />
                  </button>
                </div>
                {modelPickerOpen && (
                  <ModelPicker
                    modelId={modelId}
                    onClose={() => setModelPickerOpen(false)}
                    onSelect={(next) => {
                      setModelId(next.id);
                      setModelPickerOpen(false);
                    }}
                  />
                )}
                <ComposerInput
                  className="inline-chat-input"
                  placeholder="What's on your mind"
                  autoFocus
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSendChat();
                    } else if (e.key === "Escape") {
                      setChatVisible(false);
                    }
                  }}
                />
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
