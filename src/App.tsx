import { useEffect, useState } from "react";
import AgentPanel from "./components/agent/AgentPanel";
import CodeArea from "./components/CodeArea";
import Titlebar from "./components/Titlebar";
import { useAgent } from "./provider/AgentContext";
import { useSource } from "./provider/SourceContext";
import WorkspacePanel from "./components/workbench/WorkspacePanel";
import FileSwitcher from "./components/workbench/FileSwitcher";
import TerminalPanel from "./components/terminal/TerminalPanel";
import QuickViewDialog from "./components/QuickViewDialog";
import { useWorkbench } from "./provider/WorkbenchContext";
import { getBuiltInSpriteSheet } from "@pierre/trees";
import { motion, AnimatePresence } from "framer-motion";

export default function App() {
  const { followAgent, state } = useAgent();
  const { openFileByPath } = useSource();
  const {
    agentOpen,
    navigatorOpen,
    terminalOpen,
    layoutSwapped,
  } = useWorkbench();

  // Width and height states for sidebars and terminal
  const [navigatorWidth, setNavigatorWidth] = useState(240);
  const [agentWidth, setAgentWidth] = useState(300);
  const [terminalHeight, setTerminalHeight] = useState(240);

  useEffect(() => {
    if (followAgent && state.latestTouchedFile) {
      openFileByPath(state.latestTouchedFile);
    }
  }, [followAgent, openFileByPath, state.latestTouchedFile]);

  // Resizing mouse handlers
  const handleNavResizeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = navigatorWidth;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const newWidth = layoutSwapped ? startWidth - deltaX : startWidth + deltaX;
      setNavigatorWidth(Math.max(180, Math.min(450, newWidth)));
    };

    const handleMouseUp = () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  const handleAgentResizeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = agentWidth;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const newWidth = layoutSwapped ? startWidth + deltaX : startWidth - deltaX;
      setAgentWidth(Math.max(220, Math.min(500, newWidth)));
    };

    const handleMouseUp = () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  const handleTerminalResizeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startHeight = terminalHeight;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaY = moveEvent.clientY - startY;
      setTerminalHeight(Math.max(120, Math.min(500, startHeight - deltaY)));
    };

    const handleMouseUp = () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  // Build the layout regions
  const navigationView = navigatorOpen && (
    <motion.div
      id="navigation-region"
      initial={{ width: 0, opacity: 0 }}
      animate={{ width: navigatorWidth, opacity: 1 }}
      exit={{ width: 0, opacity: 0 }}
      transition={{ type: "spring", stiffness: 380, damping: 30 }}
      style={{ display: "flex", flexDirection: "row", height: "100%", overflow: "hidden" }}
    >
      {layoutSwapped && (
        <div
          className="panel-resize-handle"
          onMouseDown={handleNavResizeMouseDown}
          style={{ cursor: "col-resize", width: 9, position: "relative" }}
        />
      )}
      <div className="navigation-region expanded" style={{ flex: 1, height: "100%", width: "100%" }}>
        <div className="navigation-content" style={{ height: "100%" }}>
          <WorkspacePanel />
        </div>
      </div>
      {!layoutSwapped && (
        <div
          className="panel-resize-handle"
          onMouseDown={handleNavResizeMouseDown}
          style={{ cursor: "col-resize", width: 9, position: "relative" }}
        />
      )}
    </motion.div>
  );

  const agentView = agentOpen && (
    <motion.div
      id="agent-region"
      initial={{ width: 0, opacity: 0 }}
      animate={{ width: agentWidth, opacity: 1 }}
      exit={{ width: 0, opacity: 0 }}
      transition={{ type: "spring", stiffness: 380, damping: 30 }}
      style={{ display: "flex", flexDirection: "row", height: "100%", overflow: "hidden" }}
    >
      {!layoutSwapped && (
        <div
          className="panel-resize-handle"
          onMouseDown={handleAgentResizeMouseDown}
          style={{ cursor: "col-resize", width: 9, position: "relative" }}
        />
      )}
      <div className="agent-region" style={{ flex: 1, height: "100%", width: "100%" }}>
        <AgentPanel />
      </div>
      {layoutSwapped && (
        <div
          className="panel-resize-handle"
          onMouseDown={handleAgentResizeMouseDown}
          style={{ cursor: "col-resize", width: 9, position: "relative" }}
        />
      )}
    </motion.div>
  );

  return (
    <div className="workbench-shell select-none">
      <Titlebar />
      <div className="workbench-main">
        <div className="workbench-panels" style={{ display: "flex", flexDirection: "row", width: "100%", height: "100%" }}>
          <AnimatePresence initial={false}>
            {!layoutSwapped && navigationView}
            {layoutSwapped && agentView}
          </AnimatePresence>

          <div id="editor-region" style={{ flex: 1, minWidth: 0, height: "100%" }}>
            <div className="editor-surface" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
              <div style={{ flex: 1, minHeight: 0, width: "100%" }}>
                <div className="editor-island" style={{ height: "100%" }}>
                  <CodeArea />
                </div>
              </div>
              <motion.div
                id="terminal-panel"
                initial={{ height: 0, opacity: 0 }}
                animate={{
                  height: terminalOpen ? terminalHeight + 9 : 0,
                  opacity: terminalOpen ? 1 : 0,
                }}
                transition={{ type: "spring", stiffness: 380, damping: 30 }}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  overflow: "hidden",
                  pointerEvents: terminalOpen ? "auto" : "none",
                }}
              >
                <div
                  className="panel-resize-horizontal"
                  onMouseDown={handleTerminalResizeMouseDown}
                  style={{
                    cursor: "row-resize",
                    height: 9,
                    position: "relative",
                    width: "100%",
                  }}
                />
                <div className="terminal-island" style={{ height: terminalHeight }}>
                  <TerminalPanel />
                </div>
              </motion.div>
            </div>
          </div>

          <AnimatePresence initial={false}>
            {layoutSwapped && navigationView}
            {!layoutSwapped && agentView}
          </AnimatePresence>
        </div>
      </div>
      <FileSwitcher />
      <QuickViewDialog />
      <div
        style={{ display: "none" }}
        dangerouslySetInnerHTML={{ __html: getBuiltInSpriteSheet("complete") }}
      />
    </div>
  );
}
