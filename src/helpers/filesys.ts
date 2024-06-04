import { invoke } from "@tauri-apps/api/tauri"
import { nanoid } from "nanoid"
import { saveFileObject } from "../stores/file"
import { File } from "../types/File"

export const readFile = (filePath: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    invoke("get_file_content", {filePath}).then((message: unknown) => {
      resolve(message as string);
    }).catch(error => reject(error))
  })
}

export const deleteFile = (filePath: string): Promise<boolean> => {
  return new Promise((resolve, reject) => {
    invoke("delete_file", { filePath }).then((message: unknown) => {
      if (message === 'OK') {
        resolve(true)
      } else {
        reject(false)
      }
    })
  })
}

export const deleteFolder = (filePath: string): Promise<boolean> => {
  return new Promise((resolve, reject) => {
    invoke("delete_folder", { filePath }).then((message: unknown) => {
      if (message === 'OK') {
        resolve(true)
      } else {
        reject(false)
      }
    })
  })
}

export const createFolder = (filePath: string): Promise<boolean> => {
  return new Promise((resolve, reject) => {
    invoke("create_folder", { filePath }).then((message: unknown) => {
      if (message === 'OK') {
        resolve(true)
      } else {
        reject(false)
      }
    })
  })
}

export const writeFile = (filePath: string, content: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    invoke("write_file", { filePath, content }).then((message: unknown) => {
      if (message === 'OK') {
        resolve(message as string)
      } else {
        reject('ERROR')
      }
    })
  })
}

export const readDirectory = (folderPath: string): Promise<File[]> => {
  return new Promise((resolve, reject) => {
    invoke("open_folder", { folderPath }).then((message: unknown) => {
      const mess = message as string;
      const files = JSON.parse(mess.replaceAll('\\', '/').replaceAll('//', '/'));
      const entries: File[] = [];
      const folders: File[] = [];

      if (!files || !files.length) {
        resolve(entries);
        return;
      }

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const id = nanoid();
        const entry: File = {
          id,
          kind: file.kind,
          name: file.name,
          path: file.path
        }

        if (file.kind === 'file') {
          entries.push(entry)
        } else {
          folders.push(entry)
        }

        saveFileObject(id, entry)

      }

      resolve([...folders, ...entries]);

    })
  })
}
