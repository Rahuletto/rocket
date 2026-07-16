import { invoke } from "@tauri-apps/api/core";
import { saveFileObject } from "../stores/file";
import type { File, Folder } from "../types/File";
import { uuid } from "./uuid";

interface RawEntry {
  kind: "directory" | "file";
  name: string;
  path: string;
}

export const readFile = (dirPath: string): Promise<string> =>
  invoke<string>("get_contents", { dirPath });

export const deleteFile = async (dirPath: string): Promise<boolean> => {
  await invoke("delete_file", { dirPath });
  return true;
};

export const deleteFolder = async (dirPath: string): Promise<boolean> => {
  await invoke("delete_folder", { dirPath });
  return true;
};

export const createFolder = async (dirPath: string): Promise<boolean> => {
  await invoke("create_folder", { dirPath });
  return true;
};

export const writeFile = async (
  dirPath: string,
  content: string,
): Promise<string> => {
  await invoke("write", { content, dirPath });
  return "Success";
};

export const readDirectory = async (
  folderPath: string,
): Promise<(File | Folder)[]> => {
  const entries = await invoke<RawEntry[]>("open", { folderPath });
  return formatAndResolve(entries);
};

export const readAndSet = async (
  folderPath: string,
  setFiles: React.Dispatch<React.SetStateAction<(File | Folder)[]>>,
) => {
  const entries = await invoke<RawEntry[]>("open", { folderPath });
  setFiles(await formatAndResolve(entries));
};

export const watch = (folderPath: string): Promise<void> =>
  invoke("watch_changes", { dirPath: folderPath });

export async function formatAndResolve(files: RawEntry[]) {
  const entries: File[] = [];
  const folders: Folder[] = [];

  for (const file of files) {
    const path = file.path.replaceAll("\\", "/");
    const id = uuid(path);
    if (file.kind === "directory") {
      const entry: Folder = {
        children: fileSort(await readDirectory(path)),
        id,
        kind: "directory",
        name: file.name,
        path,
      };
      folders.push(entry);
      saveFileObject(id, entry);
    } else {
      const entry: File = {
        id,
        kind: "file",
        name: file.name,
        path,
      };
      entries.push(entry);
      saveFileObject(id, entry);
    }
  }

  return [...fileSort(folders), ...fileSort(entries)];
}

function fileSort(items: (File | Folder)[]): (File | Folder)[] {
  const files = items.filter(
    (item) =>
      item.kind === "file" &&
      !item.name.includes(".git") &&
      !item.name.includes(".DS_Store"),
  );
  const directories = items.filter((item) => item.kind === "directory");

  const sortedDirectories = directories.sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  const sortedFiles = files.sort((a, b) => {
    const isDotFileA = a.name.startsWith(".");
    const isDotFileB = b.name.startsWith(".");

    if (isDotFileA && !isDotFileB) return -1;
    if (!isDotFileA && isDotFileB) return 1;
    return a.name.localeCompare(b.name);
  });

  return [...sortedDirectories, ...sortedFiles];
}
