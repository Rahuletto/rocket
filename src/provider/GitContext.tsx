import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { disposeListener } from "../helpers/events";

export interface GitFileStatus {
  indexStatus: string;
  path: string;
  workingTreeStatus: string;
}

export interface GitCommit {
  author: string;
  date: string;
  hash: string;
  message: string;
  parents: string[];
  refs: string[];
  shortHash: string;
}

interface GitSnapshot {
  ahead: number;
  behind: number;
  branch: string;
  commits: GitCommit[];
  files: GitFileStatus[];
  isRepository: boolean;
}

interface GitContextValue extends GitSnapshot {
  commit: (message: string) => Promise<void>;
  diff: (path: string, cached: boolean) => Promise<string>;
  error?: string;
  loading: boolean;
  refresh: () => Promise<void>;
  stage: (paths: string[]) => Promise<void>;
  showCommit: (hash: string) => Promise<string>;
  unstage: (paths: string[]) => Promise<void>;
}

const emptySnapshot: GitSnapshot = {
  ahead: 0,
  behind: 0,
  branch: "",
  commits: [],
  files: [],
  isRepository: false,
};

const GitContext = createContext<GitContextValue | null>(null);

function workspace() {
  return localStorage.getItem("project");
}

export function GitProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState(emptySnapshot);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  const refresh = useCallback(async () => {
    const project = workspace();
    if (!project) {
      setSnapshot(emptySnapshot);
      return;
    }
    setLoading(true);
    try {
      setSnapshot(await invoke<GitSnapshot>("git_snapshot", { workspace: project }));
      setError(undefined);
    } catch (refreshError) {
      setError(String(refreshError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const workspaceChanged = () => refresh();
    window.addEventListener("rocket-workspace-changed", workspaceChanged);
    const unlisten = listen("file-changed", refresh);
    return () => {
      window.removeEventListener("rocket-workspace-changed", workspaceChanged);
      disposeListener(unlisten);
    };
  }, [refresh]);

  const mutate = useCallback(
    async (command: "git_stage" | "git_unstage", paths: string[]) => {
      const project = workspace();
      if (!project || paths.length === 0) return;
      await invoke(command, { paths, workspace: project });
      await refresh();
    },
    [refresh],
  );

  const commit = useCallback(
    async (message: string) => {
      const project = workspace();
      if (!project) return;
      await invoke("git_commit", { message, workspace: project });
      await refresh();
    },
    [refresh],
  );

  return (
    <GitContext.Provider
      value={{
        ...snapshot,
        commit,
        diff: async (path, cached) => {
          const project = workspace();
          if (!project) return "";
          return invoke<string>("git_diff", { cached, path, workspace: project });
        },
        error,
        loading,
        refresh,
        stage: (paths) => mutate("git_stage", paths),
        showCommit: async (hash) => {
          const project = workspace();
          if (!project) return "";
          return invoke<string>("git_show", { hash, workspace: project });
        },
        unstage: (paths) => mutate("git_unstage", paths),
      }}
    >
      {children}
    </GitContext.Provider>
  );
}

export function useGit() {
  const context = useContext(GitContext);
  if (!context) throw new Error("useGit must be used inside GitProvider");
  return context;
}
