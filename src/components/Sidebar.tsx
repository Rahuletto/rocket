import { open } from "@tauri-apps/plugin-dialog";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useState } from "react";
import { FilePlus2, FolderPlus, FolderOpen } from "lucide-react";
import { readAndSet, watch } from "../helpers/filesys";
import { disposeListener } from "../helpers/events";
import type { File, Folder } from "../types/File";
import { CreateFileDialog, CreateFolderDialog } from "./CreateDir";
import ProjectTree from "./workbench/ProjectTree";
import { useSource } from "../provider/SourceContext";

export default function Sidebar() {
  const { files, setFiles, projectName, setProjectName } = useSource();
  const [newFile, setNewFile] = useState(false);
  const [newFolder, setNewFolder] = useState(false);

  const loadFile = async () => {
    const selected = await open({
      directory: true,
    });

    if (!selected) return;
    const selectedPath = selected as string;
    const project = localStorage.getItem("project");
    if (project === selectedPath) {
      return;
    }
    localStorage.removeItem("directories");
    localStorage.setItem("project", selectedPath);
    setProjectName(selectedPath);
    window.dispatchEvent(new Event("rocket-workspace-changed"));

    readAndSet(`${selectedPath}/`, setFiles);
    watch(`${selectedPath}/`);
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: <explanation>
  useEffect(() => {
    const project = localStorage.getItem("project");
    if (project) {
      setProjectName(project);
      readAndSet(`${project}/`, setFiles);
      watch(`${project}/`);
    }

    const watchChange = listen("file-changed", () => {
      const currentProject = localStorage.getItem("project");
      if (currentProject) {
        readAndSet(`${currentProject}/`, setFiles);
      }
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
      disposeListener(watchChange);
      disposeListener(opener);
      disposeListener(newFileCreate);
      disposeListener(newFolderCreate);
    };
  }, []);

  useEffect(() => {
    if (newFile || newFolder) {
      const inp = document.getElementById("new-file");
      inp?.focus();
    }
  }, [newFile, newFolder]);

  return (
    <aside id="sidebar" className="workspace-panel explorer-panel">
      <header className="workspace-panel-header">
        <button
          type="button"
          id="folder-open"
          className="project-explorer"
          onClick={loadFile}
          title="Open folder"
        >
          <FolderOpen size={13} />
          {projectName
            ? projectName.split("/")[projectName.split("/").length - 1]
            : "Explorer"}
        </button>
        <div className="workspace-panel-actions">
          {projectName && (
            <>
              <button
                aria-label="New file"
                type="button"
                onClick={() => setNewFile(true)}
                title="New file"
              >
                <FilePlus2 size={14} />
              </button>

              <button
                aria-label="New folder"
                type="button"
                onClick={() => setNewFolder(true)}
                title="New folder"
              >
                <FolderPlus size={14} />
              </button>
            </>
          )}
        </div>
      </header>
      <div className="code-structure">
        {files[0] && files.length ? (
          <>
            {newFolder ? (
              <CreateFolderDialog
                path={projectName}
                setNewFolder={setNewFolder}
              />
            ) : null}
            <ProjectTree entries={files} project={projectName} />
            {newFile ? (
              <CreateFileDialog path={projectName} setNewFile={setNewFile} />
            ) : null}
          </>
        ) : (
          <button
            type="button"
            className="explorer-empty"
            onClick={loadFile}
          >
            <FolderOpen size={22} />
            Open a folder
          </button>
        )}
      </div>
    </aside>
  );
}
