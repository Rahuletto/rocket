import type { File, Folder } from "../types/File";

interface Entries {
  [key: string]: File | Folder;
}

const entries: Entries = {};

export const saveFileObject = (id: string, file: File | Folder): void => {
  entries[id] = file;
};

export const getFileObject = (id: string): File | Folder => {
  return entries[id];
};
