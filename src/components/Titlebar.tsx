import { listen } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { Bot, PanelLeft, SunMoon, TerminalSquare } from "lucide-react";
import { useEffect, useState } from "react";
import { disposeListener } from "../helpers/events";
import { useWorkbench } from "../provider/WorkbenchContext";
const appWindow = getCurrentWebviewWindow();

export default function Titlebar() {
  const [projectName, setProjectName] = useState("Rocket");
  const { agentOpen, toggleAgent, toggleNavigator, toggleTerminal } =
    useWorkbench();

  useEffect(() => {
    const html = document.querySelector("html");
    const updateProject = () => {
      const project = localStorage.getItem("project");
      setProjectName(project?.split("/").pop() || "Rocket");
    };
    const theme = localStorage.getItem("theme");
    html?.setAttribute("data-theme", theme === "light" ? "light" : "dark");
    updateProject();

    const themeChange = listen("theme", setTheme);
    window.addEventListener("rocket-workspace-changed", updateProject);
    const keydown = (event: KeyboardEvent) => {
      if (event.metaKey && event.key === "q") {
        event.preventDefault();
        appWindow.close();
      } else if (event.metaKey && event.key === "m") {
        event.preventDefault();
        appWindow.minimize();
      } else if (event.metaKey && event.key.toLowerCase() === "j") {
        event.preventDefault();
        toggleTerminal();
      }
    };
    window.addEventListener("keydown", keydown);
    return () => {
      window.removeEventListener("keydown", keydown);
      window.removeEventListener("rocket-workspace-changed", updateProject);
      disposeListener(themeChange);
    };
  }, [toggleNavigator, toggleTerminal]);

  function setTheme() {
    const html = document.querySelector("html");
    const next =
      html?.getAttribute("data-theme") === "dark" ? "light" : "dark";
    html?.setAttribute("data-theme", next);
    localStorage.setItem("theme", next);
  }

  return (
    <header
      className="titlebar"
      data-tauri-drag-region
      id="titlebar"
      onDoubleClick={(event) => {
        if (!(event.target as HTMLElement).closest("button")) {
          appWindow.toggleMaximize();
        }
      }}
      onMouseDown={(event) => {
        if (
          event.button === 0 &&
          !(event.target as HTMLElement).closest("button, input")
        ) {
          appWindow.startDragging();
        }
      }}
    >
      <div className="titlebar-left">
        <div className="traffic-lights">
          <button
            aria-label="Close window"
            className="traffic-close"
            onClick={() => appWindow.close()}
            type="button"
          />
          <button
            aria-label="Minimize window"
            className="traffic-minimize"
            onClick={() => appWindow.minimize()}
            type="button"
          />
          <button
            aria-label="Maximize window"
            className="traffic-maximize"
            onClick={() => appWindow.toggleMaximize()}
            type="button"
          />
        </div>
        <button
          aria-label="Toggle navigator"
          className="titlebar-action"
          onClick={() => toggleNavigator()}
          title="Navigator"
          type="button"
        >
          <PanelLeft size={14} />
        </button>
      </div>
      <div className="titlebar-project" data-tauri-drag-region>
        <img alt="" src="/rocket-transparent.svg" />
        <span>{projectName}</span>
      </div>
      <div className="titlebar-actions">
        <button
          aria-label="Open terminal"
          className="titlebar-action"
          onClick={toggleTerminal}
          title="Open terminal"
          type="button"
        >
          <TerminalSquare size={14} />
        </button>
        <button
          aria-label="Toggle agent"
          aria-pressed={agentOpen}
          className={`titlebar-action ${agentOpen ? "active" : ""}`}
          onClick={toggleAgent}
          title="Agent"
          type="button"
        >
          <Bot size={14} />
        </button>
        <button
          aria-label="Change theme"
          className="titlebar-action"
          onClick={setTheme}
          title="Change theme"
          type="button"
        >
          <SunMoon size={14} />
        </button>
      </div>
    </header>
  );
}
