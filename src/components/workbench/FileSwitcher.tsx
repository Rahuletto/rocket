import { FileSearch, LoaderCircle } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { readDirectory } from "../../helpers/filesys";
import { useSource } from "../../provider/SourceContext";
import type { File, Folder } from "../../types/File";
import FileIcon from "../FileIcon";

function flattenFiles(entries: (File | Folder)[], files: File[] = []) {
  for (const entry of entries) {
    if (entry.kind === "file") {
      files.push(entry);
    } else {
      flattenFiles(entry.children, files);
    }
  }
  return files;
}

function scoreFile(file: File, query: string, project: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return 0;
  const name = file.name.toLowerCase();
  const path = file.path
    .slice(project.length + 1)
    .replaceAll("\\", "/")
    .toLowerCase();
  if (name === normalized) return 1000;
  if (name.startsWith(normalized)) return 800 - name.length;
  if (name.includes(normalized)) return 600 - name.indexOf(normalized);

  let cursor = 0;
  let score = 0;
  for (const character of normalized) {
    const index = path.indexOf(character, cursor);
    if (index === -1) return -1;
    score += index === cursor ? 8 : 2;
    cursor = index + 1;
  }
  return score;
}

export default function FileSwitcher() {
  const { openFileByPath } = useSource();
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const project = localStorage.getItem("project") || "";

  const results = useMemo(
    () =>
      files
        .map((file) => ({
          file,
          score: scoreFile(file, query, project),
        }))
        .filter((entry) => entry.score >= 0)
        .sort(
          (left, right) =>
            right.score - left.score ||
            left.file.name.localeCompare(right.file.name),
        )
        .slice(0, 12),
    [files, project, query],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(true);
        setQuery("");
        setSelected(0);
      }
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const workspace = localStorage.getItem("project");
    if (!workspace) return;
    setLoading(true);
    readDirectory(workspace)
      .then((entries) => setFiles(flattenFiles(entries)))
      .finally(() => setLoading(false));
  }, [open]);

  const choose = (file: File | undefined) => {
    if (!file) return;
    openFileByPath(file.path);
    setOpen(false);
  };

  if (!open) return null;

  return (
    <div
      className="file-switcher-backdrop"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) setOpen(false);
      }}
    >
      <section
        aria-label="Open file"
        aria-modal="true"
        className="file-switcher"
        role="dialog"
      >
        <div className="file-switcher-input">
          {loading ? (
            <LoaderCircle className="agent-spinner" size={16} />
          ) : (
            <FileSearch size={16} />
          )}
          <input
            aria-label="Search project files"
            onChange={(event) => {
              setQuery(event.currentTarget.value);
              setSelected(0);
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setSelected((current) =>
                  Math.min(current + 1, results.length - 1),
                );
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setSelected((current) => Math.max(current - 1, 0));
              } else if (event.key === "Enter") {
                event.preventDefault();
                choose(results[selected]?.file);
              }
            }}
            placeholder="Open file"
            ref={inputRef}
            value={query}
          />
          <kbd>esc</kbd>
        </div>
        <div className="file-switcher-results" role="listbox">
          {!loading &&
            results.map(({ file }, index) => (
              <button
                aria-selected={selected === index}
                className={selected === index ? "selected" : ""}
                key={file.id}
                onClick={() => choose(file)}
                onMouseEnter={() => setSelected(index)}
                role="option"
                type="button"
              >
                <FileIcon name={file.name} size="sm" />
                <strong>{file.name}</strong>
                <span>
                  {file.path.slice(project.length + 1).replaceAll("\\", "/")}
                </span>
              </button>
            ))}
          {!loading && results.length === 0 && (
            <div className="file-switcher-empty">
              {project ? "No matching files" : "Open a folder first"}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
