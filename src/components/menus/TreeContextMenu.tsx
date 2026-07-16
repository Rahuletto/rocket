import type {
  ContextMenuItem,
  ContextMenuOpenContext,
} from "@pierre/trees";
import { invoke } from "@tauri-apps/api/core";
import {
  Clipboard,
  ExternalLink,
  FileText,
  FolderOpen,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { deleteFile, deleteFolder } from "../../helpers/filesys";

interface Props {
  context: ContextMenuOpenContext;
  item: ContextMenuItem;
  onOpen: (path: string) => void;
  project: string;
}

export default function TreeContextMenu({
  context,
  item,
  onOpen,
  project,
}: Props) {
  const [busy, setBusy] = useState(false);
  const absolutePath = `${project.replace(/\/$/, "")}/${item.path.replace(/\/$/, "")}`;

  const run = async (action: () => Promise<void> | void) => {
    if (busy) return;
    setBusy(true);
    try {
      await action();
      context.close();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      aria-label={`${item.name} actions`}
      className="tree-context-menu"
      data-file-tree-context-menu-root="true"
      role="menu"
    >
      <div className="tree-context-menu-title">
        {item.kind === "directory" ? <FolderOpen size={14} /> : <FileText size={14} />}
        <span>{item.name}</span>
      </div>
      {item.kind === "file" && (
        <button onClick={() => run(() => onOpen(item.path))} role="menuitem" type="button">
          <FileText size={14} />
          <span>Open</span>
          <kbd>Enter</kbd>
        </button>
      )}
      <button
        onClick={() => run(() => invoke("reveal_in_file_manager", { path: absolutePath }))}
        role="menuitem"
        type="button"
      >
        <ExternalLink size={14} />
        <span>Reveal in Finder</span>
      </button>
      <button
        onClick={() => run(() => navigator.clipboard.writeText(absolutePath))}
        role="menuitem"
        type="button"
      >
        <Clipboard size={14} />
        <span>Copy Path</span>
        <kbd>⌥⌘C</kbd>
      </button>
      <div className="tree-context-menu-separator" role="separator" />
      <button
        className="destructive"
        disabled={busy}
        onClick={() =>
          run(() =>
            item.kind === "file"
              ? deleteFile(absolutePath).then(() => {})
              : deleteFolder(absolutePath).then(() => {}),
          )
        }
        role="menuitem"
        type="button"
      >
        <Trash2 size={14} />
        <span>Delete</span>
        <kbd>⌫</kbd>
      </button>
    </div>
  );
}
