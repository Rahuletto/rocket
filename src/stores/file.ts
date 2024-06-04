import { File } from "../types/File"

interface IEntries {
  [key: string]: File
}

const entries: IEntries = {}

export const saveFileObject = (id: string, file: File): void => {
  entries[id] = file
}

export const getFileObject = (id: string): File => {
  return entries[id]
}

