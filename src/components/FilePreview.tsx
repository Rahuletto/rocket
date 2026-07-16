import { lazy, Suspense, useEffect, useState } from "react";
import { code } from "@streamdown/code";
import { convertFileSrc } from "@tauri-apps/api/core";
import { readFile } from "../helpers/filesys";
import type { File } from "../types/File";

const Streamdown = lazy(() =>
  import("streamdown").then((module) => ({ default: module.Streamdown })),
);

export default function FilePreview({ file }: { file: File }) {
  const extension = file.name.split(".").at(-1)?.toLowerCase();
  const [content, setContent] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (extension !== "md" && extension !== "markdown" && extension !== "mdx") {
      return;
    }
    setError("");
    readFile(file.path).then(setContent).catch((reason) => setError(String(reason)));
  }, [extension, file.path]);

  if (extension === "svg") {
    return (
      <div className="visual-preview svg-preview">
        <img alt={file.name} src={convertFileSrc(file.path)} />
      </div>
    );
  }

  if (error) {
    return <div className="preview-error">{error}</div>;
  }

  return (
    <div className="markdown-preview">
      <Suspense fallback={<div className="review-loading">Rendering preview</div>}>
        <Streamdown
          animated={false}
          className="markdown-preview-content"
          controls={{ code: true, table: true }}
          mode="static"
          plugins={{ code }}
          shikiTheme={["github-light", "github-dark"]}
        >
          {content}
        </Streamdown>
      </Suspense>
    </div>
  );
}
