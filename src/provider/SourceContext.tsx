import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { getFileObjectByPath } from "../stores/file";
import {
  closeSourceFile,
  openSourceFile,
  replaceSourceFiles,
  type SourceState,
} from "./sourceState";

import type { File, Folder } from "../types/File";

interface SourceContextValue {
  addOpenedFile: (id: string) => void;
  delOpenedFile: (id: string) => void;
  opened: string[];
  openFileByPath: (path: string) => void;
  selected: string;
  setOpenedFile: (ids: string[]) => void;
  setSelect: (id: string) => void;
  files: (File | Folder)[];
  setFiles: React.Dispatch<React.SetStateAction<(File | Folder)[]>>;
  projectName: string;
  setProjectName: React.Dispatch<React.SetStateAction<string>>;
  quickViewPath: string | null;
  setQuickViewPath: React.Dispatch<React.SetStateAction<string | null>>;
}

const SourceContext = createContext<SourceContextValue | null>(null);

export function SourceProvider({ children }: { children: ReactNode }) {
  const [quickViewPath, setQuickViewPath] = useState<string | null>(null);
  const [files, setFiles] = useState<(File | Folder)[]>([]);
  const [projectName, setProjectName] = useState("");
  const [state, setState] = useState<SourceState>({
    opened: [],
    selected: "",
  });

  const addOpenedFile = useCallback(
    (id: string) => setState((current) => openSourceFile(current, id)),
    [],
  );

  const delOpenedFile = useCallback(
    (id: string) => setState((current) => closeSourceFile(current, id)),
    [],
  );

  const setOpenedFile = useCallback(
    (ids: string[]) =>
      setState((current) => replaceSourceFiles(current, ids)),
    [],
  );

  const openFileByPath = useCallback(
    (path: string) => {
      const project = localStorage.getItem("project");
      const absolutePath =
        project && !path.startsWith("/") ? `${project}/${path}` : path;
      const file = getFileObjectByPath(absolutePath);
      if (!file || file.kind !== "file") return;

      setState((current) => openSourceFile(current, file.id));
    },
    [],
  );

  const value = useMemo<SourceContextValue>(
    () => ({
      addOpenedFile,
      delOpenedFile,
      opened: state.opened,
      openFileByPath,
      selected: state.selected,
      setOpenedFile,
      setSelect: (id) =>
        setState((current) =>
          current.selected === id
            ? current
            : current.opened.includes(id)
            ? { ...current, selected: id }
            : openSourceFile(current, id),
        ),
      files,
      setFiles,
      projectName,
      setProjectName,
      quickViewPath,
      setQuickViewPath,
    }),
    [
      addOpenedFile,
      delOpenedFile,
      openFileByPath,
      setOpenedFile,
      state.opened,
      state.selected,
      files,
      projectName,
      quickViewPath,
    ],
  );

  return (
    <SourceContext.Provider value={value}>{children}</SourceContext.Provider>
  );
}

export function useSource() {
  const context = useContext(SourceContext);
  if (!context) {
    throw new Error("useSource must be used inside SourceProvider");
  }
  return context;
}
