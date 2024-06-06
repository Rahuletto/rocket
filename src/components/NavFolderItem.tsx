import { useEffect, useState } from "react";
import { File, Folder } from "../types/File";
import NavFiles from "./NavFiles";
import {  FaFolder, FaFolderOpen, FaPlus } from "react-icons/fa6";
import { TriggerEvent, useContextMenu } from "react-contexify";
import { dirStore, isOpened } from "../stores/states";

import { CreateFileDialog } from "../helpers/create";

interface Props {
  file: File | Folder;
  active: boolean;
}

export default function NavFolderItem({ file, active }: Props) {
  const [files, setFiles] = useState<(File | Folder)[]>([]);
  const [unfold, setUnfold] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [newFile, setNewFile] = useState(false);


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
  }, [file])

  useEffect(() => {
    if (newFile) {
      const inp = document.getElementById("new-file");
      inp?.focus();
    }
  }, [newFile]);

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
        <span onClick={onShow} className="text-[14px] whitespace-nowrap text-ellipsis overflow-hidden" style={{overflowWrap: "anywhere"}}>
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
        <CreateFileDialog path={file.path} setNewFile={setNewFile} />
      ) : null}

      <NavFiles visible={unfold} files={files} />
    </div>
  );
}
