import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Plus, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useWorkbench } from "../../provider/WorkbenchContext";
import { Bash } from "just-bash";

interface TerminalOutput {
  data: string;
  terminalId: string;
}

interface TerminalPane {
  id: string;
  type: "local" | "sandboxed";
}

interface ShellTab {
  id: string;
  title: string;
  panes: TerminalPane[];
  splitDirection: "row" | "column";
}

function createShell(index: number, type: "local" | "sandboxed" = "local"): ShellTab {
  const paneId = `pane-${crypto.randomUUID()}`;
  return {
    id: `tab-${crypto.randomUUID()}`,
    title: `${type === "sandboxed" ? "sandbox" : "zsh"} ${index}`,
    panes: [{ id: paneId, type }],
    splitDirection: "row",
  };
}

function TerminalSession({
  active,
  id,
  type,
  isSplit,
  onFocus,
}: {
  active: boolean;
  id: string;
  type: "local" | "sandboxed";
  isSplit: boolean;
  onFocus: () => void;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const onFocusRef = useRef(onFocus);
  onFocusRef.current = onFocus;

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let disposed = false;
    let disposeOutput: (() => void) | undefined;
    const terminal = new Terminal({
      allowProposedApi: false,
      convertEol: false,
      cursorBlink: true,
      cursorStyle: "bar",
      fontFamily: '"SF Mono", "JetBrains Mono", ui-monospace, monospace',
      fontSize: 12,
      lineHeight: 1.3,
      macOptionIsMeta: true,
      scrollback: 10000,
      theme: {
        background: "#181916",
        black: "#20211e",
        brightBlack: "#777873",
        brightBlue: "#8ab4f8",
        brightCyan: "#7ad7d0",
        brightGreen: "#70c993",
        brightMagenta: "#c7a0e8",
        brightRed: "#ef7b72",
        brightWhite: "#ffffff",
        brightYellow: "#e8c66a",
        cursor: "#e7e5e1",
        foreground: "#e7e5e1",
        selectionBackground: "#ffffff24",
      },
    });
    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.open(mount);
    terminalRef.current = terminal;
    fitRef.current = fit;

    // @xterm/xterm v6 removed Terminal.onFocus; track focus via the host element.
    const handleFocusIn = () => {
      onFocusRef.current();
    };
    mount.addEventListener("focusin", handleFocusIn);

    if (type === "local") {
      terminal.write("\x1b[38;5;244mStarting shell...\x1b[0m\r\n");

      const start = async () => {
        disposeOutput = await listen<TerminalOutput>(
          "terminal-output",
          (event) => {
            if (event.payload.terminalId === id) {
              terminal.write(event.payload.data);
            }
          },
        );
        if (disposed) {
          disposeOutput();
          return;
        }
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        );
        fit.fit();
        terminal.clear();
        await invoke<string>("terminal_create", {
          cols: terminal.cols,
          rows: terminal.rows,
          terminalId: id,
          workspace: localStorage.getItem("project") || "/",
        });
        terminal.focus();
      };

      const dataListener = terminal.onData((data) => {
        invoke("terminal_write", { data, terminalId: id }).catch(() => {});
      });

      let resizeTimer: number | undefined;
      const resizeObserver = new ResizeObserver(() => {
        if (!mount.offsetParent) return;
        if (resizeTimer) window.clearTimeout(resizeTimer);
        resizeTimer = window.setTimeout(() => {
          fit.fit();
          invoke("terminal_resize", {
            cols: terminal.cols,
            rows: terminal.rows,
            terminalId: id,
          }).catch(() => {});
        }, 16);
      });
      resizeObserver.observe(mount);

      start().catch((error) => {
        terminal.writeln(`\x1b[31mTerminal failed: ${String(error)}\x1b[0m`);
      });

      return () => {
        disposed = true;
        mount.removeEventListener("focusin", handleFocusIn);
        resizeObserver.disconnect();
        dataListener.dispose();
        disposeOutput?.();
        invoke("terminal_close", { terminalId: id }).catch(() => {});
        terminal.dispose();
        terminalRef.current = null;
        fitRef.current = null;
        if (resizeTimer) window.clearTimeout(resizeTimer);
      };
    } else {
      // Sandboxed terminal using just-bash from Vercel
      const bash = new Bash({
        env: { PATH: "/bin" }
      });
      
      let currentLine = "";
      const printPrompt = () => {
        const cwd = bash.getCwd();
        terminal.write(`\r\n\x1b[32mjust-bash \x1b[34m${cwd} \x1b[39m$ `);
      };
      
      terminal.write("\x1b[38;5;244mStarting sandboxed just-bash shell...\x1b[0m\r\n");
      printPrompt();

      const dataListener = terminal.onData(async (data) => {
        for (let i = 0; i < data.length; i++) {
          const char = data[i];
          if (char === "\r" || char === "\n") {
            terminal.write("\r\n");
            const cmd = currentLine.trim();
            currentLine = "";
            if (cmd) {
              try {
                const res = await bash.exec(cmd);
                if (res.stdout) {
                  terminal.write(res.stdout.replace(/\r?\n/g, "\r\n"));
                }
                if (res.stderr) {
                  terminal.write(res.stderr.replace(/\r?\n/g, "\r\n"));
                }
              } catch (err: any) {
                terminal.write(`\x1b[31mError: ${err.message || String(err)}\x1b[0m\r\n`);
              }
            }
            printPrompt();
          } else if (char === "\u007f" || char === "\b") {
            if (currentLine.length > 0) {
              currentLine = currentLine.slice(0, -1);
              terminal.write("\b \b");
            }
          } else {
            currentLine += char;
            terminal.write(char);
          }
        }
      });

      const resizeObserver = new ResizeObserver(() => {
        if (!mount.offsetParent) return;
        fit.fit();
      });
      resizeObserver.observe(mount);

      return () => {
        mount.removeEventListener("focusin", handleFocusIn);
        dataListener.dispose();
        resizeObserver.disconnect();
        terminal.dispose();
        terminalRef.current = null;
        fitRef.current = null;
      };
    }
  }, [id, type]);

  useEffect(() => {
    if (!active) return;
    requestAnimationFrame(() => {
      fitRef.current?.fit();
      terminalRef.current?.focus();
    });
  }, [active]);

  return (
    <div
      aria-hidden={!active}
      className={`terminal-session ${active ? "active" : ""} ${isSplit ? "terminal-session-split" : ""}`}
      ref={mountRef}
      style={{ width: "100%", height: "100%" }}
    />
  );
}

export default function TerminalPanel() {
  const { setTerminalOpen } = useWorkbench();
  const [shells, setShells] = useState<ShellTab[]>(() => [createShell(1)]);
  const [activeTabId, setActiveTabId] = useState(() => shells[0].id);
  const [activePaneId, setActivePaneId] = useState(() => shells[0].panes[0].id);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

  // Auto-focus pane when tab changes
  useEffect(() => {
    const activeTab = shells.find((tab) => tab.id === activeTabId);
    if (activeTab && activeTab.panes.length > 0) {
      // Set to first pane of this tab if current active pane is not in this tab
      const hasPane = activeTab.panes.some((p) => p.id === activePaneId);
      if (!hasPane) {
        setActivePaneId(activeTab.panes[0].id);
      }
    }
  }, [activeTabId, shells, activePaneId]);

  const addShell = (type: "local" | "sandboxed" = "local") => {
    const shell = createShell(shells.length + 1, type);
    setShells((current) => [...current, shell]);
    setActiveTabId(shell.id);
    setActivePaneId(shell.panes[0].id);
  };

  const closeShell = (id: string) => {
    setShells((current) => {
      const index = current.findIndex((shell) => shell.id === id);
      const next = current.filter((shell) => shell.id !== id);
      if (id === activeTabId) {
        const nextTab = next[Math.min(index, next.length - 1)];
        setActiveTabId(nextTab?.id ?? "");
        setActivePaneId(nextTab?.panes[0]?.id ?? "");
      }
      return next;
    });
  };

  const splitActiveTab = (direction: "row" | "column") => {
    setShells((current) =>
      current.map((tab) => {
        if (tab.id === activeTabId) {
          // Get the active pane type to spawn the same type
          const activePane = tab.panes.find((p) => p.id === activePaneId) || tab.panes[0];
          const newPaneId = `pane-${crypto.randomUUID()}`;
          const newPane: TerminalPane = { id: newPaneId, type: activePane.type };
          
          setActivePaneId(newPaneId);
          return {
            ...tab,
            splitDirection: direction,
            panes: [...tab.panes, newPane],
          };
        }
        return tab;
      })
    );
  };

  const closePane = (tabId: string, paneId: string) => {
    setShells((current) =>
      current.map((tab) => {
        if (tab.id === tabId) {
          const nextPanes = tab.panes.filter((p) => p.id !== paneId);
          if (paneId === activePaneId && nextPanes.length > 0) {
            setActivePaneId(nextPanes[0].id);
          }
          return {
            ...tab,
            panes: nextPanes,
          };
        }
        return tab;
      }).filter((tab) => tab.panes.length > 0) // close tab if no panes left
    );
  };

  // Keyboard shortcut listener for splitting
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMod = e.metaKey || e.ctrlKey;
      if (isMod && e.key.toLowerCase() === "d") {
        e.preventDefault();
        if (e.shiftKey) {
          splitActiveTab("column");
        } else {
          splitActiveTab("row");
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeTabId, activePaneId, shells]);

  const handlePlusContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  useEffect(() => {
    if (!contextMenu) return;
    const handleOutsideClick = () => setContextMenu(null);
    window.addEventListener("click", handleOutsideClick);
    return () => window.removeEventListener("click", handleOutsideClick);
  }, [contextMenu]);

  const handleDragOver = (e: React.DragEvent) => {
    const types = e.dataTransfer?.types;
    if (types?.includes("text/plain") || types?.includes("rocket-file-path")) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    }
  };

  const handlePaneDrop = (e: React.DragEvent, paneId: string, paneType: "local" | "sandboxed") => {
    e.preventDefault();
    
    // Check if drop coordinates are near the borders to trigger a split view
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const thresholdX = rect.width * 0.25;
    const thresholdY = rect.height * 0.25;
    
    if (x < thresholdX || x > rect.width - thresholdX) {
      splitActiveTab("row");
      return;
    } else if (y < thresholdY || y > rect.height - thresholdY) {
      splitActiveTab("column");
      return;
    }

    // Otherwise, normal file path insert behavior
    const filePath = e.dataTransfer?.getData("rocket-file-path") || 
                     e.dataTransfer?.getData("text/plain");
    if (filePath && paneId) {
      const project = localStorage.getItem("project");
      const absolutePath =
        project && !filePath.startsWith("/") ? `${project}/${filePath}` : filePath;
      const formattedPath = absolutePath.includes(" ") ? `"${absolutePath}" ` : `${absolutePath} `;
      
      if (paneType === "local") {
        invoke("terminal_write", { data: formattedPath, terminalId: paneId }).catch(() => {});
      } else {
        // Find the active xterm terminal or emulate terminal write
        // (will be typed into active sandboxed instance)
      }
    }
  };

  const activeTab = shells.find((tab) => tab.id === activeTabId);

  return (
    <section
      aria-label="Terminal panel"
      className="terminal-panel"
      onDragOver={handleDragOver}
    >
      <header className="terminal-header">
        <div className="terminal-tabs" role="tablist">
          {shells.map((shell) => (
            <div
              aria-selected={activeTabId === shell.id}
              className={`terminal-tab ${activeTabId === shell.id ? "active" : ""}`}
              key={shell.id}
              onClick={() => {
                setActiveTabId(shell.id);
                if (shell.panes.length > 0) {
                  setActivePaneId(shell.panes[0].id);
                }
              }}
              onDoubleClick={() => setRenamingId(shell.id)}
              role="tab"
              tabIndex={activeTabId === shell.id ? 0 : -1}
            >
              {renamingId === shell.id ? (
                <input
                  aria-label="Terminal name"
                  autoFocus
                  defaultValue={shell.title}
                  onBlur={(event) => {
                    const title = event.currentTarget.value.trim();
                    setShells((current) =>
                      current.map((item) =>
                        item.id === shell.id
                          ? { ...item, title: title || item.title }
                          : item,
                      ),
                    );
                    setRenamingId(null);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") event.currentTarget.blur();
                    if (event.key === "Escape") setRenamingId(null);
                  }}
                />
              ) : (
                <span>{shell.title}</span>
              )}
              <button
                aria-label={`Close ${shell.title}`}
                onClick={(event) => {
                  event.stopPropagation();
                  closeShell(shell.id);
                }}
                title="Close terminal"
                type="button"
              >
                <X size={12} />
              </button>
            </div>
          ))}
          <button
            aria-label="New terminal"
            className="terminal-new"
            onClick={() => addShell("local")}
            onContextMenu={handlePlusContextMenu}
            title="New terminal"
            type="button"
          >
            <Plus size={14} />
          </button>
        </div>
        <div className="terminal-actions">
          <button
            aria-label="Kill active terminal"
            disabled={!activeTabId}
            onClick={() => activeTabId && closeShell(activeTabId)}
            title="Kill active terminal"
            type="button"
          >
            <Trash2 size={13} />
          </button>
          <button
            aria-label="Close terminal panel"
            onClick={() => setTerminalOpen(false)}
            title="Close panel"
            type="button"
          >
            <X size={14} />
          </button>
        </div>
      </header>
      <div className="terminal-sessions">
        {shells.length === 0 && (
          <button className="terminal-empty" onClick={() => addShell("local")} type="button">
            <Plus size={15} />
            New terminal
          </button>
        )}
        {activeTab && (
          <div
            style={{
              display: "flex",
              flexDirection: activeTab.splitDirection,
              width: "100%",
              height: "100%",
              gap: "8px",
            }}
          >
            {activeTab.panes.map((pane) => (
              <div
                key={pane.id}
                onDragOver={handleDragOver}
                onDrop={(e) => handlePaneDrop(e, pane.id, pane.type)}
                style={{
                  flex: 1,
                  minWidth: 0,
                  minHeight: 0,
                  position: "relative",
                  border: "none",
                  borderRadius: "6px",
                  overflow: "hidden",
                }}
              >
                <TerminalSession
                  active={activeTabId === activeTab.id}
                  id={pane.id}
                  onFocus={() => setActivePaneId(pane.id)}
                  type={pane.type}
                  isSplit={activeTab.panes.length > 1}
                />
                {activeTab.panes.length > 1 && (
                  <div className="terminal-pane-header">
                    <span>{pane.type === "sandboxed" ? "Sandboxed Shell (just-bash)" : "Local Shell (zsh)"}</span>
                    <button
                      onClick={() => closePane(activeTab.id, pane.id)}
                      title="Close pane"
                    >
                      <X size={10} />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {contextMenu && (
        <div
          className="terminal-context-menu"
          style={{
            position: "fixed",
            top: contextMenu.y,
            left: contextMenu.x,
            zIndex: 999999,
          }}
        >
          <button
            onClick={() => {
              addShell("local");
              setContextMenu(null);
            }}
          >
            New Terminal
          </button>
          <button
            onClick={() => {
              addShell("sandboxed");
              setContextMenu(null);
            }}
          >
            Sandboxed Terminal
          </button>
        </div>
      )}
    </section>
  );
}
