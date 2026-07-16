import type { File, Folder } from "../types/File";

interface Entries {
  [key: string]: File | Folder;
}

const entries: Entries = {};
const listeners = new Set<() => void>();
let version = 0;

export const saveFileObject = (id: string, file: File | Folder): void => {
  entries[id] = file;
  version += 1;
  listeners.forEach((listener) => listener());
};

export const getFileStoreVersion = () => version;

export const subscribeFileStore = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const getFileObject = (id: string): File | Folder => {
  return entries[id];
};

export const getFileObjectByPath = (path: string): File | Folder | undefined => {
  const normalized = path.replaceAll("\\", "/");
  return Object.values(entries).find(
    (entry) => entry.path.replaceAll("\\", "/") === normalized,
  );
};
