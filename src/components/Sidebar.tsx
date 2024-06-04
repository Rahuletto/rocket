import { useEffect, useState } from "react";
import { File } from "../types/File";
import { open } from "@tauri-apps/api/dialog";
import NavFiles from "./NavFiles";
import { createFolder, readDirectory } from "../helpers/filesys";
import { BiPlus, BiSolidFilePlus, BiSolidFolderPlus } from "react-icons/bi";
import { writeFile } from "../helpers/filesys";
import { FaFile, FaFolder } from "react-icons/fa6";
import { nanoid } from "nanoid";
import { saveFileObject } from "../stores/file";

export default function Sidebar() {
  const [projectName, setProjectName] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [newFile, setNewFile] = useState(false);
  const [newFolder, setNewFolder] = useState(false);
  const [filename, setFilename] = useState("");
  const [foldername, setFoldername] = useState("");

  const loadFile = async () => {
    const selected = await open({
      directory: true,
    });

    if (!selected) return;
    localStorage.setItem("project", selected as string);
    setProjectName(selected as string);

    readDirectory(selected + "/").then((readFiles) => {
      setFiles(readFiles);
    });
  };

  useEffect(() => {
    const project = localStorage.getItem("project");
    if (project) {
      setProjectName(project);
      readDirectory(project + "/").then((readFiles) => {
        setFiles(readFiles);
      });
    }
  }, []);

  useEffect(() => {
    if (newFile || newFolder) {
      const inp = document.getElementById("new-file");
      inp?.focus();
    }
  }, [newFile, newFolder]);

  const onEnterFolder = (key: string) => {
    if (key === "Escape") {
      setNewFolder(false);
      setFoldername("");
      return;
    }

    if (key !== "Enter") return;

    const folder = `${projectName}/${foldername}`;

    createFolder(folder).then(() => {
      const id = nanoid();
      const newFolder: File = {
        id,
        name: foldername,
        path: folder,
        kind: "directory",
      };

      saveFileObject(id, newFolder);
      setFiles((prevEntries) => [newFolder, ...prevEntries]);
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

    const filePath = `${projectName}/${filename}`;

    writeFile(filePath, "").then(() => {
      const id = nanoid();
      const newFile: File = {
        id,
        name: filename,
        path: filePath,
        kind: "file",
      };

      saveFileObject(id, newFile);
      setFiles((prevEntries) => [...prevEntries, newFile]);
      setNewFile(false);
      setFilename("");
    });
  };

  return (
    <aside id="sidebar" className="w-60 shrink-0 h-full bg-transparent">
      <div className="sidebar-header flex items-center justify-between p-4 py-2.5">
        <button
          id="folder-open"
          className="project-explorer text-xs uppercase font-bold opacity-70"
          onClick={loadFile}
        >
          {projectName
            ? projectName.split("/")[projectName.split("/").length - 1]
            : "File explorer"}
        </button>
        <div className="flex gap-2">
          {projectName && (
            <>
              <button
                onClick={() => setNewFile(true)}
                className="whitespace-nowrap text-gray-400 text-md"
              >
                <BiSolidFilePlus />
              </button>

              <button
                onClick={() => setNewFolder(true)}
                className="whitespace-nowrap text-gray-400 text-md"
              >
                <BiSolidFolderPlus />
              </button>
            </>
          )}
        </div>
      </div>
      <div
        className="code-structure overflow-auto mb-12 pb-12 px-2 pt-2"
        style={{ height: "calc(100vh - 40px)" }}
      >
        {files[0] ? (
          <>
            {newFolder ? (
              <div className="mx-4 flex items-center gap-0.5 p-2">
                <i className="text-gray-300">
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
            ) : null}
            <NavFiles visible={true} files={files} />
            {newFile ? (
              <div className="mx-4 flex items-center gap-0.5 p-2">
                <i className="text-gray-300">
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
          </>
        ) : (
          <button
            className="project-explorer text-lg p-6 cursor-pointer font-bold"
            onClick={loadFile}
          >
            Open a folder
          </button>
        )}
      </div>
    </aside>
  );
}
