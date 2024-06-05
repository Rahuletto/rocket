import { useEffect, useState } from "react";
import { createFolder, writeFile } from "../helpers/filesys";
import { saveFileObject } from "../stores/file";
import { File, Folder } from "../types/File";
import NavFiles from "./NavFiles";
import { FaFile, FaFolder, FaFolderOpen, FaPlus } from "react-icons/fa6";
import { TriggerEvent, useContextMenu } from "react-contexify";
import { dirStore, isOpened } from "../stores/states";
import { uuid } from "../helpers/uuid";

interface Props {
  file: File | Folder;
  active: boolean;
}

export default function NavFolderItem({ file, active }: Props) {
  const [files, setFiles] = useState<(File | Folder)[]>([]);
  const [unfold, setUnfold] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [newFile, setNewFile] = useState(false);
  const [newFolder, setNewFolder] = useState(false);
  const [filename, setFilename] = useState("");
  const [foldername, setFoldername] = useState("");


  const { show } = useContextMenu({
    id: "file",
  });

  function displayMenu(
    e: TriggerEvent,
    props: { path: string; name: string; isFile?: boolean; isFolder?: boolean }
  ) {
    show({
      event: e,
      props,
    });
  }

  const onShow = async (ev: React.MouseEvent<HTMLSpanElement, MouseEvent>) => {
    ev.stopPropagation();
    if (file.kind === "file") return;

    const opener =isOpened(file.path)

    if (loaded) {
      dirStore(file.path, false)
      setUnfold(!unfold);
      return;
    }

    setLoaded(true);
    setFiles(file.children);
    dirStore(file.path, true)
    setUnfold(!unfold);

  };

  useEffect(() => {
    if (isOpened(file.path) && file.kind === "directory"){
      setLoaded(true);
      setFiles(file.children);
      setUnfold(true);
    }
  }, [])

  useEffect(() => {
    if (newFile) {
      const inp = document.getElementById("new-file");
      inp?.focus();
    }
  }, [newFile]);

  const onEnterFolder = (key: string) => {
    if (key === "Escape") {
      setNewFolder(false);
      setFoldername("");
      return;
    }

    if (key !== "Enter") return;

    const folder = `${file.path}/${foldername}`;

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

  const onEnterFile = (key: string) => {
    if (key === "Escape") {
      setNewFile(false);
      setFilename("");
      return;
    }

    if (key !== "Enter") return;

    const dirPath = `${file.path}/${filename}`;

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
    <div className="source-item">
      <div
        onContextMenu={(e) =>
          displayMenu(e, { name: file.name, path: file.path, isFolder: true })
        }
        className={`source-folder select-none ${
          active ? "bg-gray-200 border-2 border-light" : ""
        } rounded-lg flex items-center gap-2 px-2 py-0.5 text-gray-500 hover:text-gray-400 cursor-pointer`}
      >
        <i className="text-files">{active ? <FaFolderOpen /> : <FaFolder />}</i>
        <div className="source-header flex items-center justify-between w-full group">
          <span onClick={onShow} className="text-[14px] w-full">
            {file.name}
          </span>
          <i
            onClick={() => setNewFile(true)}
            className="invisible group-hover:visible"
          >
            <FaPlus />
          </i>
        </div>
      </div>

      {newFile ? (
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
      ) : null}

      <NavFiles visible={unfold} files={files} />
    </div>
  );
}
