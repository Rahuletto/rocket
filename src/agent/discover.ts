import { invoke } from "@tauri-apps/api/core";
import { readDirectory } from "../helpers/filesys";
import type { File, Folder } from "../types/File";

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "target",
  ".next",
  "__pycache__",
  ".cache",
  ".turbo",
  "coverage",
  "src-tauri/target",
]);

const CODE_EXT =
  /\.(ts|tsx|js|jsx|json|md|py|go|rs|css|html|yaml|yml|toml|sh|sql|vue|svelte|c|cpp|h|java|kt|swift)$/i;

function flattenFiles(
  entries: (File | Folder)[],
  root: string,
  depth: number,
  out: string[],
): void {
  if (depth > 6) return;
  for (const entry of entries) {
    if (entry.kind === "directory") {
      if (SKIP_DIRS.has(entry.name)) continue;
      flattenFiles(entry.children ?? [], root, depth + 1, out);
    } else if (CODE_EXT.test(entry.name)) {
      const rel = entry.path.startsWith(root)
        ? entry.path.slice(root.length).replace(/^\//, "")
        : entry.path;
      out.push(rel);
    }
  }
}

/** Walk workspace for @-mention completion (best-effort via existing FS API). */
export async function listWorkspaceFiles(workspace: string): Promise<string[]> {
  try {
    // Prefer a native walk when available.
    const native = await invoke<string[]>("agent_list_files", {
      folderPath: workspace,
      maxDepth: 6,
    }).catch(() => null);
    if (native) return native;

    const root = workspace.replace(/\\/g, "/").replace(/\/$/, "");
    const tree = await readDirectory(root);
    const out: string[] = [];
    flattenFiles(tree, root, 0, out);
    return out.sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
}

export async function listWorkspaceSkills(workspace: string): Promise<string[]> {
  try {
    const native = await invoke<string[]>("agent_list_skills", {
      folderPath: workspace,
    }).catch(() => null);
    if (native) return native;

    const skillsDir = `${workspace.replace(/\/$/, "")}/.agents/skills`;
    const entries = await readDirectory(skillsDir);
    return entries
      .filter((entry) => entry.kind === "directory")
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
}
