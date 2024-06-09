import { invoke } from "@tauri-apps/api/tauri";

import { listen } from "@tauri-apps/api/event";
import { saveFileObject } from "../stores/file";
import type { File, Folder } from "../types/File";
import { uuid } from "./uuid";

export const readFile = (dirPath: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    invoke("get_contents", { dirPath })
      .then((message: unknown) => {
        resolve(message as string);
      })
      .catch((error) => reject(error));
  });
};

export const deleteFile = (dirPath: string): Promise<boolean> => {
  return new Promise((resolve, reject) => {
    invoke("delete_file", { dirPath }).then((message: unknown) => {
      if (message === "Success") {
        resolve(true);
      } else {
        reject(false);
      }
    });
  });
};

export const deleteFolder = (dirPath: string): Promise<boolean> => {
  return new Promise((resolve, reject) => {
    invoke("delete_folder", { dirPath }).then((message: unknown) => {
      if (message === "Success") {
        resolve(true);
      } else {
        reject(false);
      }
    });
  });
};

export const createFolder = (dirPath: string): Promise<boolean> => {
  return new Promise((resolve, reject) => {
    invoke("create_folder", { dirPath }).then((message: unknown) => {
      if (message === "Success") {
        resolve(true);
      } else {
        reject(false);
      }
    });
  });
};

export const writeFile = (
  dirPath: string,
  content: string,
): Promise<string> => {
  return new Promise((resolve, reject) => {
    invoke("write", { dirPath, content }).then((message: unknown) => {
      if (message === "Success") {
        resolve(message as string);
      } else {
        reject("Crash!");
      }
    });
  });
};

export const readDirectory = (
  folderPath: string,
): Promise<(File | Folder)[]> => {
  return new Promise((resolve) => {
    invoke("open", { folderPath }).then((message: unknown) => {
      formatAndResolve(message).then((resolver) => {
        resolve(resolver);
      });
    });
  });
};

export const readAndSet = (
  folderPath: string,
  setFiles: React.Dispatch<React.SetStateAction<(File | Folder)[]>>,
) => {
  invoke("open", { folderPath }).then((message: unknown) => {
    formatAndResolve(message).then((resolver) => {
      setFiles(resolver);
    });
  });
};

export const watch = (folderPath: string) => {
  invoke("watch_changes", { dirPath: folderPath });
};

export async function formatAndResolve(message: unknown) {
  const mess = message as string;
  const files = JSON.parse(mess.replaceAll("\\", "/").replaceAll("//", "/"));
  const entries: File[] = [];
  const folders: Folder[] = [];

  if (!files || !files.length) {
    return entries;
  }

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const id = uuid(file.path);
    if (file.kind === "directory") {
      const entry: Folder = {
        id,
        kind: "directory",
        name: file.name,
        path: file.path,
        children: fileSort(await readDirectory(`${file.path}/`)),
      };
      folders.push(entry);
      saveFileObject(id, entry);
    } else if (file.kind === "file") {
      const entry: File = {
        id,
        kind: file.kind,
        name: file.name,
        path: file.path,
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

  const sortedDirectories: (File | Folder)[] = directories.sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  const sortedFiles = files.sort((a, b) => {
    const isDotFileA = a.name.startsWith(".");
    const isDotFileB = b.name.startsWith(".");

    if (isDotFileA && !isDotFileB) return -1;
    if (!isDotFileA && isDotFileB) return 1;

    return a.name.localeCompare(b.name);
  });

  return sortedDirectories.concat(sortedFiles);
}
