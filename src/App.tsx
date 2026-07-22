import { useEffect, useState } from "react";
import AgentPanel from "./components/agent/AgentPanel";
import CodeArea from "./components/CodeArea";
import Titlebar from "./components/Titlebar";
import { useAgent } from "./provider/AgentContext";
import { useSource } from "./provider/SourceContext";
import WorkspacePanel from "./components/workbench/WorkspacePanel";
import FileSwitcher from "./components/workbench/FileSwitcher";
import TerminalPanel from "./components/terminal/TerminalPanel";
import ProblemsPanel from "./components/lsp/ProblemsPanel";
import StatusBar from "./components/workbench/StatusBar";
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
    problemsOpen,
    layoutSwapped,
  } = useWorkbench();

  // Width and height states for sidebars and terminal
  const [navigatorWidth, setNavigatorWidth] = useState(240);
  const [agentWidth, setAgentWidth] = useState(300);
  const [terminalHeight, setTerminalHeight] = useState(240);
  const [terminalResizing, setTerminalResizing] = useState(false);
  const [navResizing, setNavResizing] = useState(false);
  const [agentResizing, setAgentResizing] = useState(false);

  // Keep the terminal mounted slightly after close so the collapse animation
  // can play without unmounting xterm mid-flight (which is expensive).
  const [terminalMounted, setTerminalMounted] = useState(terminalOpen);
  useEffect(() => {
    if (terminalOpen || problemsOpen) {
      setTerminalMounted(true);
      return;
    }
    const t = window.setTimeout(() => setTerminalMounted(false), 240);
    return () => window.clearTimeout(t);
  }, [terminalOpen, problemsOpen]);

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
    setNavResizing(true);
    let frame = 0;
    let latest = startWidth;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      latest = Math.max(180, Math.min(450, layoutSwapped ? startWidth - deltaX : startWidth + deltaX));
      if (!frame) {
        frame = requestAnimationFrame(() => {
          frame = 0;
          setNavigatorWidth(latest);
        });
      }
    };

    const handleMouseUp = () => {
      if (frame) cancelAnimationFrame(frame);
      setNavResizing(false);
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
    setAgentResizing(true);
    let frame = 0;
    let latest = startWidth;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      latest = Math.max(220, Math.min(500, layoutSwapped ? startWidth + deltaX : startWidth - deltaX));
      if (!frame) {
        frame = requestAnimationFrame(() => {
          frame = 0;
          setAgentWidth(latest);
        });
      }
    };

    const handleMouseUp = () => {
      if (frame) cancelAnimationFrame(frame);
      setAgentResizing(false);
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
    setTerminalResizing(true);
    let frame = 0;
    let latest = startHeight;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaY = moveEvent.clientY - startY;
      latest = Math.max(120, Math.min(500, startHeight - deltaY));
      if (!frame) {
        frame = requestAnimationFrame(() => {
          frame = 0;
          setTerminalHeight(latest);
        });
      }
    };

    const handleMouseUp = () => {
      setTerminalResizing(false);
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
      transition={navResizing ? { duration: 0 } : { type: "spring", stiffness: 380, damping: 30 }}
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
      transition={agentResizing ? { duration: 0 } : { type: "spring", stiffness: 380, damping: 30 }}
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
                initial={false}
                animate={{
                  height: terminalOpen || problemsOpen ? terminalHeight + 9 : 0,
                  opacity: terminalOpen || problemsOpen ? 1 : 0,
                }}
                transition={terminalResizing ? { duration: 0 } : { duration: 0.22, ease: "easeOut" }}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  overflow: "hidden",
                  pointerEvents: terminalOpen || problemsOpen ? "auto" : "none",
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
                    flex: "0 0 auto",
                  }}
                />
                <div className="terminal-island" style={{ flex: 1, minHeight: 0 }}>
                  {terminalMounted && (problemsOpen ? <ProblemsPanel /> : <TerminalPanel />)}
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
      <StatusBar />
      <FileSwitcher />
      <QuickViewDialog />
      <div
        style={{ display: "none" }}
        dangerouslySetInnerHTML={{ __html: getBuiltInSpriteSheet("complete") }}
      />
    </div>
  );
}
