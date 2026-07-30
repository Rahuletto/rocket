import { listen } from "@tauri-apps/api/event";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";
import { flushEditorContext } from "../agent/editorContext";
import { disposeListener } from "../helpers/events";

export type WorkbenchView = "explorer" | "git" | "search";

interface WorkbenchContextValue {
  activeView: WorkbenchView;
  agentOpen: boolean;
  navigatorOpen: boolean;
  setActiveView: (view: WorkbenchView) => void;
  setAgentOpen: (open: boolean) => void;
  setNavigatorOpen: (open: boolean) => void;
  setTerminalOpen: (open: boolean) => void;
  problemsOpen: boolean;
  setProblemsOpen: (open: boolean) => void;
  toggleAgent: () => void;
  toggleNavigator: (view?: WorkbenchView) => void;
  terminalOpen: boolean;
  toggleTerminal: () => void;
  layoutSwapped: boolean;
  toggleLayoutSwap: () => void;
}

const WorkbenchContext = createContext<WorkbenchContextValue | null>(null);

export function WorkbenchProvider({ children }: { children: ReactNode }) {
  const [activeView, setActiveView] = useState<WorkbenchView>("explorer");
  const [agentOpen, setAgentOpen] = useState(false);
  const [navigatorOpen, setNavigatorOpen] = useState(true);
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [problemsOpen, setProblemsOpen] = useState(false);
  const [layoutSwapped, setLayoutSwapped] = useState(false);

  useEffect(() => {
    const unlistenTerminal = listen("terminal-toggle", () => {
      setTerminalOpen((current) => !current);
    });
    const unlistenSidebar = listen("toggle_sidebar", () => {
      setNavigatorOpen((current) => !current);
    });
    const unlistenAgent = listen("toggle_agent", () => {
      setAgentOpen((current) => !current);
    });
    const unlistenSwap = listen("swap", () => {
      setLayoutSwapped((current) => !current);
    });
    const unlistenSave = listen("save", () => {
      void flushEditorContext().catch(() => undefined);
    });

    return () => {
      disposeListener(unlistenTerminal);
      disposeListener(unlistenSidebar);
      disposeListener(unlistenAgent);
      disposeListener(unlistenSwap);
      disposeListener(unlistenSave);
    };
  }, []);

  return (
    <WorkbenchContext.Provider
      value={{
        activeView,
        agentOpen,
        navigatorOpen,
        setActiveView,
        setAgentOpen,
        setNavigatorOpen,
        setTerminalOpen,
        problemsOpen,
        setProblemsOpen,
        toggleAgent: () => setAgentOpen((current) => !current),
        toggleNavigator: (view) => {
          if (view && view !== activeView) {
            setActiveView(view);
            setNavigatorOpen(true);
            return;
          }
          setNavigatorOpen((current) => !current);
        },
        terminalOpen,
        toggleTerminal: () => setTerminalOpen((current) => !current),
        layoutSwapped,
        toggleLayoutSwap: () => setLayoutSwapped((current) => !current),
      }}
    >
      {children}
    </WorkbenchContext.Provider>
  );
}

export function useWorkbench() {
  const context = useContext(WorkbenchContext);
  if (!context) {
    throw new Error("useWorkbench must be used inside WorkbenchProvider");
  }
  return context;
}
