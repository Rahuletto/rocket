import { useState } from "react";
import { FaFile, FaFolder } from "react-icons/fa6";
import { saveFileObject } from "../stores/file";
import { Folder, File } from "../types/File";
import { writeFile, createFolder } from "./filesys";
import { uuid } from "./uuid";

export function CreateFileDialog({
  path,
  setNewFile,
}: {
  path: string;
  setNewFile: (value: boolean) => void;
}) {
  const [filename, setFilename] = useState("");

  const onEnterFile = (key: string) => {
    if (key === "Escape") {
      setNewFile(false);
      setFilename("");
      return;
    }

    if (key !== "Enter") return;

    const dirPath = `${path}/${filename}`;

    writeFile(dirPath, "").then(() => {
      const id = uuid(dirPath);
      const newFile: File = {
        id,
        name: filename,
        path: dirPath,
        kind: "file",
      };

      saveFileObject(id, newFile);
      setNewFile(false);
      setFilename("");
    });
  };

  return (
    <div className="mx-4 flex items-center gap-0.5 p-2">
      <i className="text-files mr-2">
        <FaFile />
      </i>
      <input
        type="text"
        value={filename}
        id="new-file"
        onChange={(ev) => setFilename(ev.target.value)}
        onKeyUp={(ev) => onEnterFile(ev.key)}
        className="inp bg-transparent"
      />
    </div>
  );
}

export function CreateFolderDialog({
  path,
  setNewFolder,
}: {
  path: string;
  setNewFolder: (value: boolean) => void;
}) {
  const [foldername, setFoldername] = useState("");

  const onEnterFolder = (key: string) => {
    if (key === "Escape") {
      setNewFolder(false);
      setFoldername("");
      return;
    }

    if (key !== "Enter") return;

    const folder = `${path}/${foldername}`;

    createFolder(folder).then(() => {
      const id = uuid(folder);
      const newFolder: Folder = {
        id,
        name: foldername,
        path: folder,
        kind: "directory",
        children: [],
      };

      saveFileObject(id, newFolder);
      setNewFolder(false);
      setFoldername("");
    });
  };

  return (
    <div className="mx-4 flex items-center gap-0.5 p-2">
      <i className="text-files mr-2">
        <FaFolder />
      </i>
      <input
        type="text"
        value={foldername}
        id="new-file"
        onChange={(ev) => setFoldername(ev.target.value)}
        onKeyUp={(ev) => onEnterFolder(ev.key)}
        className="inp bg-transparent"
      />
    </div>
  );
}
