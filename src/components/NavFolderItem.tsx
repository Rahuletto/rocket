import { nanoid } from "nanoid";
import { useEffect, useState } from "react";
import { readDirectory, writeFile } from "../helpers/filesys";
import { saveFileObject } from "../stores/file";
import { File } from "../types/File";
import NavFiles from "./NavFiles";
import { FaFile, FaFolder, FaFolderOpen, FaPlus } from "react-icons/fa6";
import { TriggerEvent, useContextMenu } from "react-contexify";

interface Props {
  file: File;
  active: boolean;
}

export default function NavFolderItem({ file, active }: Props) {
  const [files, setFiles] = useState<File[]>([]);
  const [unfold, setUnfold] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [newFile, setNewFile] = useState(false);
  const [filename, setFilename] = useState("");

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

    if (loaded) {
      setUnfold(!unfold);
      return;
    }

    const entries = await readDirectory(file.path + "/");

    setLoaded(true);
    setFiles(entries);
    setUnfold(!unfold);
  };

  useEffect(() => {
    if (newFile) {
      const inp = document.getElementById("new-file");
      inp?.focus();
    }
  }, [newFile]);

  const onEnter = (key: string) => {
    if (key === "Escape") {
      setNewFile(false);
      setFilename("");
      return;
    }

    if (key !== "Enter") return;

    const filePath = `${file.path}/${filename}`;

    writeFile(filePath, "").then(() => {
      const id = nanoid();
      const newFile: File = {
        id,
        name: filename,
        path: filePath,
        kind: "file",
      };

      saveFileObject(id, newFile);
      setFiles((prevEntries) => [newFile, ...prevEntries]);
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
        <i className="text-color">{active ? <FaFolderOpen /> : <FaFolder />}</i>
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
          <i className="text-gray-300 mr-2">
            <FaFile />
          </i>
          <input
            type="text"
            value={filename}
            id="new-file"
            onChange={(ev) => setFilename(ev.target.value)}
            onKeyUp={(ev) => onEnter(ev.key)}
            className="inp bg-transparent"
          />
        </div>
      ) : null}

      <NavFiles
        onContextMenu={(e: TriggerEvent) =>
          displayMenu(e, { name: file.name, path: file.path, isFile: true })
        }
        visible={unfold}
        files={files}
      />
    </div>
  );
}
