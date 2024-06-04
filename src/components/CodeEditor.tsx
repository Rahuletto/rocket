
import { useEffect, useState } from "react";
import MonacoEditor from "@monaco-editor/react";
import { getFileObject } from "../stores/file";
import { readFile, writeFile } from "../helpers/filesys";
import { Languages } from "../types/Languages";


interface Props {
  id: string;
  active: boolean;
  language: string;
}

export default function CodeEditor({ id, active, language }: Props) {
  const visible = active ? "" : "hidden";

  const [code, setCode] = useState("");
  const [display, setDisplay] = useState("");
  const [html, setHtml] = useState<any>(null);
  const [theme, setTheme] = useState("dark");

  const updateEditorContent = async (id: string) => {
    const file = getFileObject(id);
    if(!file) return;
    
    const content = await readFile(file.path);

    setCode(content);
    setDisplay(content);
  };

  const onSave = async () => {
    const file = getFileObject(id);
    writeFile(file.path, code);
  };

  useEffect(() => {
    updateEditorContent(id);
  }, [id]);

  useEffect(() => {
    const ht = document.querySelector("html");
    setHtml(ht);
    setTheme(ht?.getAttribute("data-theme") || "dark");

    language = Languages.find(({ name }) => name === language)?.name || "plaintext";
  }, []);

  function handleEditorWillMount(monaco: typeof import("/Users/rahulmarban/Documents/Coding/rocket/node_modules/monaco-editor/esm/vs/editor/editor.api")) {
    monaco.languages.typescript.javascriptDefaults.setCompilerOptions({
      target: monaco.languages.typescript.ScriptTarget.ES2016,
      allowNonTsExtensions: true,
      moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
      module: monaco.languages.typescript.ModuleKind.CommonJS,
      noEmit: true,
      typeRoots: ["node_modules/@types"],
      jsx: monaco.languages.typescript.JsxEmit.React,
      jsxFactory: 'React.createElement',
    })

    monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
      target: monaco.languages.typescript.ScriptTarget.ES2016,
      allowNonTsExtensions: true,
      moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
      module: monaco.languages.typescript.ModuleKind.CommonJS,
      noEmit: true,
      typeRoots: ["node_modules/@types"],
      jsx: monaco.languages.typescript.JsxEmit.React,
      jsxFactory: 'React.createElement',
    })

    monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
      noSemanticValidation: true,
      noSyntaxValidation: true,
    });
  }

  useEffect(() => {
    setTheme(html?.getAttribute("data-theme") || "dark");

    const timeoutId = setTimeout(() => onSave(), 1000);
    return () => clearTimeout(timeoutId);
  }, [code]);

  return (
    <main
      className={`w-full overflow-y-auto ${visible}`}
      style={{ height: "calc(100vh - 40px)" }}
    >
      <MonacoEditor
        path={language}
        defaultLanguage={language}
        theme={`${theme == "dark" ? "vs-dark" : "github"}`}
        value={display}
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
          overviewRulerBorder: true,
          overviewRulerLanes: 2,
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
            verticalHasArrows: true,
            horizontalHasArrows: true,
            vertical: "visible",
            horizontal: "auto",
            verticalScrollbarSize: 12,
            horizontalScrollbarSize: 12,
            arrowSize: 10,
          },
        }}
        onChange={(value) => setCode(value || "")}
        beforeMount={handleEditorWillMount}
      />
    </main>
  );
}