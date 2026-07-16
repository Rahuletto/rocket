import type { GitStatus, GitStatusEntry } from "@pierre/trees";
import { FileTree, useFileTree } from "@pierre/trees/react";
import { useEffect, useMemo, useRef } from "react";
import { useGit } from "../../provider/GitContext";
import { useSource } from "../../provider/SourceContext";
import type { File, Folder } from "../../types/File";
import TreeContextMenu from "../menus/TreeContextMenu";

function flattenEntries(
  entries: (File | Folder)[],
  project: string,
  paths: string[] = [],
) {
  for (const entry of entries) {
    const relative = entry.path
      .replaceAll("\\", "/")
      .slice(project.replaceAll("\\", "/").length + 1);
    paths.push(entry.kind === "directory" ? `${relative}/` : relative);
    if (entry.kind === "directory") {
      flattenEntries(entry.children, project, paths);
    }
  }
  return paths;
}

function treeGitStatus(indexStatus: string, workingStatus: string): GitStatus {
  const status = workingStatus !== " " ? workingStatus : indexStatus;
  if (status === "A") return "added";
  if (status === "D") return "deleted";
  if (status === "R" || status === "C") return "renamed";
  if (status === "?") return "untracked";
  return "modified";
}

export default function ProjectTree({
  entries,
  project,
}: {
  entries: (File | Folder)[];
  project: string;
}) {
  const { files } = useGit();
  const { openFileByPath, setQuickViewPath } = useSource();
  const openRef = useRef(openFileByPath);
  openRef.current = openFileByPath;
  const paths = useMemo(
    () => flattenEntries(entries, project).sort(),
    [entries, project],
  );
  const gitStatus = useMemo<GitStatusEntry[]>(
    () =>
      files.map((file) => ({
        path: file.path,
        status: treeGitStatus(file.indexStatus, file.workingTreeStatus),
      })),
    [files],
  );
  const { model } = useFileTree({
    density: "compact",
    flattenEmptyDirectories: true,
    icons: {
      colored: true,
      set: "complete",
    },
    initialExpansion: 1,
    onSelectionChange: (selectedPaths) => {
      const selected = selectedPaths.at(-1);
      if (selected && !selected.endsWith("/")) {
        openRef.current(selected);
      }
    },
    paths,
    search: false,
    stickyFolders: true,
    composition: {
      contextMenu: {
        enabled: true,
        triggerMode: "right-click",
      },
    },
  });

  useEffect(() => {
    model.resetPaths(paths);
  }, [model, paths]);

  useEffect(() => {
    model.setGitStatus(gitStatus);
  }, [gitStatus, model]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      const isInsideTree = activeEl && (activeEl.classList.contains("project-tree") || activeEl.closest(".project-tree"));
      if (isInsideTree && e.key === " ") {
        e.preventDefault();
        const selected = model.getSelectedPaths().at(-1);
        if (selected && !selected.endsWith("/")) {
          setQuickViewPath(selected);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [model, setQuickViewPath]);

  useEffect(() => {
    const treeEl = document.querySelector(".project-tree");
    if (!treeEl) return;

    const handleDragStart = (e: DragEvent) => {
      const target = e.target as HTMLElement;
      const item = target.closest("[role='treeitem']");
      if (item) {
        const path = item.getAttribute("data-item-path");
        const type = item.getAttribute("data-item-type");
        if (path && type === "file") {
          e.dataTransfer?.setData("rocket-file-path", path);
          e.dataTransfer?.setData("text/plain", path);
          if (e.dataTransfer) {
            e.dataTransfer.effectAllowed = "copyMove";
          }
        }
      }
    };

    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const item = target.closest("[role='treeitem']");
      if (item) {
        item.setAttribute("draggable", "true");
      }
    };

    treeEl.addEventListener("dragstart", handleDragStart as EventListener);
    treeEl.addEventListener("mousedown", handleMouseDown as EventListener);

    return () => {
      treeEl.removeEventListener("dragstart", handleDragStart as EventListener);
      treeEl.removeEventListener("mousedown", handleMouseDown as EventListener);
    };
  }, [paths]);

  return (
    <FileTree
      aria-label="Project files"
      className="project-tree"
      model={model}
      renderContextMenu={(item, context) => (
        <TreeContextMenu
          context={context}
          item={item}
          onOpen={(path) => openRef.current(path)}
          project={project}
        />
      )}
      style={
        {
          "--trees-accent-override": "var(--accent)",
          "--trees-bg-override": "transparent",
          "--trees-border-color-override": "transparent",
          "--trees-fg-override": "var(--muted)",
          "--trees-fg-muted-override": "var(--subtle)",
          "--trees-font-size-override": "12px",
          "--trees-item-padding-x-override": "9px",
          "--trees-padding-inline-override": "14px",
          "--trees-selected-bg-override": "var(--selection)",
          height: "100%",
        } as React.CSSProperties
      }
    />
  );
}
