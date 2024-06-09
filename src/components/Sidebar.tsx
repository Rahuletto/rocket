import { open } from "@tauri-apps/api/dialog";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useState } from "react";
import { BiSolidFilePlus, BiSolidFolderPlus } from "react-icons/bi";
import { readAndSet, watch } from "../helpers/filesys";
import type { File, Folder } from "../types/File";
import { CreateFileDialog, CreateFolderDialog } from "./CreateDir";
import NavFiles from "./NavFiles";

export default function Sidebar() {
  const [projectName, setProjectName] = useState("");
  const [files, setFiles] = useState<(File | Folder)[]>([]);
  const [newFile, setNewFile] = useState(false);
  const [newFolder, setNewFolder] = useState(false);

  const loadFile = async () => {
    const selected = await open({
      directory: true,
    });

    if (!selected) return;
    const project = localStorage.getItem("project");
    if (project === selected) {
      return;
    } else {
      localStorage.removeItem("directories");
      localStorage.setItem("project", selected as string);
      setProjectName(selected as string);

      readAndSet(selected + "/", setFiles);
      watch(project + "/");
    }
  };

  useEffect(() => {
    const project = localStorage.getItem("project");
    if (project) {
      setProjectName(project);
      readAndSet(project + "/", setFiles);
      watch(project + "/");
    }

    const watchChange = listen("file-changed", () => {
      console.log("File changed");
      readAndSet(project + "/", setFiles);
    });

    const opener = listen("open_dir", () => {
      loadFile();
      return;
    });

    const newFileCreate = listen("new_file", () => {
      setNewFile(true);
    });

    const newFolderCreate = listen("new_folder", () => {
      setNewFolder(true);
    });

    return () => {
      watchChange.then((fn) => fn());
      opener.then((fn) => fn());
      newFileCreate.then((fn) => fn());
      newFolderCreate.then((fn) => fn());
    };
  }, []);

  useEffect(() => {
    if (newFile || newFolder) {
      const inp = document.getElementById("new-file");
      inp?.focus();
    }
  }, [newFile, newFolder]);

  return (
    <aside id="sidebar" className="shrink-0 h-full bg-transparent">
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
        {files && files[0] && files.length ? (
          <>
            {newFolder ? (
              <CreateFolderDialog
                path={projectName}
                setNewFolder={setNewFolder}
              />
            ) : null}
            <NavFiles visible={true} files={files} />
            {newFile ? (
              <CreateFileDialog path={projectName} setNewFile={setNewFile} />
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
