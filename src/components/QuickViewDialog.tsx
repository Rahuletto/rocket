import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { readFile } from "../helpers/filesys";
import FilePreview from "./FilePreview";
import Editor from "@monaco-editor/react";
import { useSource } from "../provider/SourceContext";

export default function QuickViewDialog() {
  const { quickViewPath, setQuickViewPath } = useSource();
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!quickViewPath) return;
    setLoading(true);
    readFile(quickViewPath)
      .then((data) => {
        setContent(data);
        setLoading(false);
      })
      .catch((err) => {
        setContent(`Error reading file: ${String(err)}`);
        setLoading(false);
      });
  }, [quickViewPath]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setQuickViewPath(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [setQuickViewPath]);

  if (!quickViewPath) return null;

  const fileName = quickViewPath.split("/").at(-1) || "";
  const extension = fileName.split(".").at(-1)?.toLowerCase() || "";
  const isMarkdown = ["md", "markdown", "mdx", "svg"].includes(extension);

  const fileObject = {
    id: quickViewPath,
    name: fileName,
    path: quickViewPath,
    kind: "file" as const,
  };

  return (
    <div
      className="quick-view-overlay"
      onClick={() => setQuickViewPath(null)}
    >
      <div
        className="quick-view-dialog"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="quick-view-header">
          <span className="quick-view-title">{fileName} (Preview)</span>
          <button
            className="quick-view-close"
            onClick={() => setQuickViewPath(null)}
            type="button"
          >
            <X size={16} />
          </button>
        </header>
        <div className="quick-view-body">
          {loading ? (
            <div className="quick-view-loading">Loading preview...</div>
          ) : isMarkdown ? (
            <FilePreview file={fileObject} />
          ) : (
            <Editor
              height="100%"
              language={getEditorLanguage(extension)}
              theme="vs-dark"
              value={content}
              options={{
                readOnly: true,
                minimap: { enabled: true },
                fontSize: 12,
                fontFamily: '"SF Mono", "JetBrains Mono", monospace',
                lineHeight: 1.5,
                scrollBeyondLastLine: false,
                automaticLayout: true,
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function getEditorLanguage(ext: string): string {
  switch (ext) {
    case "ts":
    case "tsx":
      return "typescript";
    case "js":
    case "jsx":
      return "javascript";
    case "py":
      return "python";
    case "rs":
      return "rust";
    case "css":
      return "css";
    case "html":
      return "html";
    case "json":
      return "json";
    case "go":
      return "go";
    case "sh":
    case "bash":
    case "zsh":
      return "shell";
    case "md":
    case "markdown":
      return "markdown";
    default:
      return "plaintext";
  }
}
