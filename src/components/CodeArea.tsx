import { convertFileSrc } from "@tauri-apps/api/core";
import {
  DockviewReact,
  type DockviewApi,
  type DockviewReadyEvent,
  type DockviewTheme,
  type IDockviewPanelHeaderProps,
  type IDockviewPanelProps,
  type IWatermarkPanelProps,
} from "dockview-react";
import { Code2, Eye, X } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { getMonacoLanguage } from "../helpers/language";
import { useReview } from "../provider/ReviewContext";
import { useSource } from "../provider/SourceContext";
import {
  getFileObject,
  getFileObjectByPath,
  getFileStoreVersion,
  subscribeFileStore,
} from "../stores/file";
import type { File } from "../types/File";
import CodeEditor from "./CodeEditor";
import FileIcon from "./FileIcon";
import FilePreview from "./FilePreview";
import ReviewSurface from "./review/ReviewSurface";

interface EditorPanelParams {
  fileId: string;
}

const darkTheme: DockviewTheme = {
  className: "dockview-theme-rocket",
  colorScheme: "dark",
  dndOverlayBorder: "1px solid var(--hairline-strong)",
  dndOverlayMounting: "relative",
  dndPanelOverlay: "content",
  dndTabIndicator: "line",
  gap: 5,
  name: "rocket-dark",
  tabAnimation: "smooth",
  tabGroupIndicator: "none",
};

const lightTheme: DockviewTheme = {
  ...darkTheme,
  colorScheme: "light",
  name: "rocket-light",
};

function isImage(name: string) {
  return [
    ".avif",
    ".bmp",
    ".gif",
    ".ico",
    ".jpeg",
    ".jpg",
    ".png",
    ".webp",
  ].some((extension) => name.toLowerCase().endsWith(extension));
}

function useFile(fileId: string) {
  useSyncExternalStore(
    subscribeFileStore,
    getFileStoreVersion,
    getFileStoreVersion,
  );
  return getFileObject(fileId) as File | undefined;
}

function useColorScheme() {
  const [scheme, setScheme] = useState(
    document.documentElement.getAttribute("data-theme") || "dark",
  );

  useEffect(() => {
    const root = document.documentElement;
    const observer = new MutationObserver(() => {
      setScheme(root.getAttribute("data-theme") || "dark");
    });
    observer.observe(root, { attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  return scheme;
}

function EditorPanel({ params }: IDockviewPanelProps<EditorPanelParams>) {
  const file = useFile(params.fileId);
  const [preview, setPreview] = useState(false);
  const extension = file?.name.split(".").at(-1)?.toLowerCase() || "";
  const previewable = ["markdown", "md", "mdx", "svg"].includes(extension);

  useEffect(() => {
    setPreview(false);
  }, [params.fileId]);

  if (!file) {
    return (
      <div className="editor-panel-unavailable">
        <strong>File unavailable</strong>
        <span>Rocket will reopen it when the workspace finishes loading.</span>
      </div>
    );
  }

  return (
    <section className="editor-panel-content">
      {previewable && (
        <div className="editor-view-toggle" role="group" aria-label="File view">
          <button
            aria-label="Edit source"
            aria-pressed={!preview}
            className={!preview ? "active" : ""}
            onClick={() => setPreview(false)}
            title="Edit source"
            type="button"
          >
            <Code2 size={13} />
          </button>
          <button
            aria-label="Open preview"
            aria-pressed={preview}
            className={preview ? "active" : ""}
            onClick={() => setPreview(true)}
            title="Preview"
            type="button"
          >
            <Eye size={13} />
          </button>
        </div>
      )}
      <div className="editor-panel-body">
        {preview && previewable ? (
          <FilePreview file={file} />
        ) : isImage(file.name) ? (
          <div className="image-preview">
            <img alt={file.name} src={convertFileSrc(file.path)} />
          </div>
        ) : (
          <CodeEditor
            active
            id={file.id}
            language={getMonacoLanguage(extension)}
          />
        )}
      </div>
    </section>
  );
}

function EditorTab({
  api,
  params,
}: IDockviewPanelHeaderProps<EditorPanelParams>) {
  const file = useFile(params.fileId);
  const title = file?.name || api.title || "Loading";

  const handlePointerDown = () => {
    document.body.classList.add("is-dragging-tab");
    
    const handlePointerUp = () => {
      document.body.classList.remove("is-dragging-tab");
      window.removeEventListener("pointerup", handlePointerUp);
    };
    
    window.addEventListener("pointerup", handlePointerUp);
  };

  return (
    <div className="editor-dock-tab" onPointerDown={handlePointerDown}>
      <FileIcon name={title} size="sm" />
      <span title={file?.path}>{title}</span>
      <button
        aria-label={`Close ${title}`}
        onClick={(event) => {
          event.stopPropagation();
          api.close();
        }}
        title="Close"
        type="button"
      >
        <X size={13} />
      </button>
    </div>
  );
}

function EditorWatermark(_props: IWatermarkPanelProps) {
  return (
    <div className="editor-empty">
      <img alt="" src="/rocket-transparent.svg" />
      <strong>Rocket</strong>
      <span>Open a file or use Command K.</span>
    </div>
  );
}

const components = { editor: EditorPanel };
const tabComponents = { editorTab: EditorTab };

function layoutStorageKey() {
  const workspace = localStorage.getItem("project") || "untitled";
  return `rocket:editor-layout:${workspace}`;
}

export default function CodeArea() {
  const { opened, selected, setOpenedFile, setSelect, openFileByPath } = useSource();
  const { review } = useReview();
  const apiRef = useRef<DockviewApi | undefined>(undefined);
  const disposablesRef = useRef<Array<{ dispose: () => void }>>([]);
  const storageKeyRef = useRef(layoutStorageKey());
  const suspendPersistenceRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const scheme = useColorScheme();
  const theme = scheme === "light" ? lightTheme : darkTheme;

  const persistLayout = useCallback((api: DockviewApi) => {
    if (suspendPersistenceRef.current) return;
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      localStorage.setItem(storageKeyRef.current, JSON.stringify(api.toJSON()));
    }, 120);
  }, []);

  const syncSourceState = useCallback(
    (api: DockviewApi) => {
      setOpenedFile(api.panels.map((panel) => panel.id));
      const activeId = api.activePanel?.id;
      if (activeId) setSelect(activeId);
    },
    [setOpenedFile, setSelect],
  );

  const restoreLayout = useCallback(
    (api: DockviewApi) => {
      const saved = localStorage.getItem(storageKeyRef.current);
      if (!saved) return false;

      try {
        api.fromJSON(JSON.parse(saved));
        syncSourceState(api);
        return true;
      } catch {
        localStorage.removeItem(storageKeyRef.current);
        api.clear();
        return false;
      }
    },
    [syncSourceState],
  );

  const handleReady = useCallback(
    ({ api }: DockviewReadyEvent) => {
      apiRef.current = api;
      restoreLayout(api);

      disposablesRef.current.forEach((disposable) => disposable.dispose());
      disposablesRef.current = [
        api.onDidActivePanelChange(({ panel }) => {
          if (panel) setSelect(panel.id);
        }),
        api.onDidLayoutChange(() => {
          syncSourceState(api);
          persistLayout(api);
        }),
        api.onUnhandledDragOver((e) => {
          if (e.nativeEvent instanceof DragEvent) {
            const types = e.nativeEvent.dataTransfer?.types;
            if (types?.includes("text/plain") || types?.includes("rocket-file-path")) {
              e.accept();
            }
          }
        }),
        api.onDidDrop((e) => {
          if (!e.group) return;
          if (e.nativeEvent instanceof DragEvent) {
            const filePath = e.nativeEvent.dataTransfer?.getData("rocket-file-path") || 
                               e.nativeEvent.dataTransfer?.getData("text/plain");
            if (filePath && !filePath.endsWith("/")) {
              const project = localStorage.getItem("project");
              const absolutePath =
                project && !filePath.startsWith("/") ? `${project}/${filePath}` : filePath;
              const file = getFileObjectByPath(absolutePath);
              if (file && file.kind === "file") {
                const referencePanel = e.group.activePanel?.id;
                const directionMap: Record<string, string> = {
                  center: "within",
                  left: "left",
                  right: "right",
                  top: "above",
                  bottom: "below",
                };
                const direction = directionMap[e.position] || "within";

                const existingPanel = api.getPanel(file.id);
                if (existingPanel) {
                  existingPanel.api.moveTo({
                    group: e.group,
                    position: e.position as any,
                  });
                } else {
                  api.addPanel({
                    component: "editor",
                    id: file.id,
                    params: { fileId: file.id },
                    renderer: "always",
                    tabComponent: "editorTab",
                    title: file.name,
                    position: referencePanel
                      ? { referencePanel, direction: direction as any }
                      : undefined,
                  });
                }
                openFileByPath(filePath);
              }
            }
          }
        }),
      ];
    },
    [persistLayout, restoreLayout, setSelect, syncSourceState, openFileByPath],
  );

  useEffect(() => {
    const api = apiRef.current;
    if (!api) return;

    opened.forEach((fileId) => {
      if (api.getPanel(fileId)) return;
      const file = getFileObject(fileId);
      api.addPanel({
        component: "editor",
        id: fileId,
        params: { fileId },
        renderer: "always",
        tabComponent: "editorTab",
        title: file?.name || "Loading",
      });
    });

    const activePanel = selected ? api.getPanel(selected) : undefined;
    if (activePanel && api.activePanel?.id !== selected) {
      activePanel.api.setActive();
    }
  }, [opened, selected]);

  useEffect(() => {
    const handleWorkspaceChange = () => {
      const api = apiRef.current;
      if (!api) return;

      suspendPersistenceRef.current = true;
      api.clear();
      setOpenedFile([]);
      storageKeyRef.current = layoutStorageKey();
      restoreLayout(api);
      suspendPersistenceRef.current = false;
    };

    window.addEventListener("rocket-workspace-changed", handleWorkspaceChange);
    return () => {
      window.removeEventListener(
        "rocket-workspace-changed",
        handleWorkspaceChange,
      );
    };
  }, [restoreLayout, setOpenedFile]);

  useEffect(
    () => () => {
      clearTimeout(saveTimerRef.current);
      disposablesRef.current.forEach((disposable) => disposable.dispose());
      disposablesRef.current = [];
    },
    [],
  );

  useEffect(() => {
    const setupTabScrollButtons = () => {
      const scrollables = document.querySelectorAll(".dv-tabs-and-actions-container .dv-scrollable");
      scrollables.forEach((el) => {
        const scrollable = el as HTMLElement;
        const parent = scrollable.parentElement;
        if (!parent) return;

        let leftBtn = parent.querySelector(".custom-tab-scroll-btn.left-btn") as HTMLButtonElement | null;
        let rightBtn = parent.querySelector(".custom-tab-scroll-btn.right-btn") as HTMLButtonElement | null;

        if (!leftBtn) {
          leftBtn = document.createElement("button");
          leftBtn.className = "custom-tab-scroll-btn left-btn";
          leftBtn.innerHTML = `<svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2.5" fill="none"><polyline points="15 18 9 12 15 6"></polyline></svg>`;
          leftBtn.onclick = (e) => {
            e.stopPropagation();
            scrollable.scrollBy({ left: -140, behavior: "smooth" });
          };
          parent.insertBefore(leftBtn, scrollable);
        }

        if (!rightBtn) {
          rightBtn = document.createElement("button");
          rightBtn.className = "custom-tab-scroll-btn right-btn";
          rightBtn.innerHTML = `<svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2.5" fill="none"><polyline points="9 18 15 12 9 6"></polyline></svg>`;
          rightBtn.onclick = (e) => {
            e.stopPropagation();
            scrollable.scrollBy({ left: 140, behavior: "smooth" });
          };
          parent.insertBefore(rightBtn, scrollable.nextSibling);
        }

        // Show/hide based on overflow
        const hasOverflow = scrollable.scrollWidth > scrollable.clientWidth;
        if (hasOverflow) {
          leftBtn.style.display = scrollable.scrollLeft > 2 ? "flex" : "none";
          rightBtn.style.display = scrollable.scrollLeft + scrollable.clientWidth < scrollable.scrollWidth - 2 ? "flex" : "none";
        } else {
          leftBtn.style.display = "none";
          rightBtn.style.display = "none";
        }
      });
    };

    const timer = setInterval(setupTabScrollButtons, 400);
    window.addEventListener("resize", setupTabScrollButtons);
    const handleScroll = (e: Event) => {
      if ((e.target as HTMLElement).classList.contains("dv-scrollable")) {
        setupTabScrollButtons();
      }
    };
    document.addEventListener("scroll", handleScroll, true);

    return () => {
      clearInterval(timer);
      window.removeEventListener("resize", setupTabScrollButtons);
      document.removeEventListener("scroll", handleScroll, true);
    };
  }, []);

  const tabMenu = useMemo(
    () => ["close", "closeOthers", "separator", "closeAll"] as const,
    [],
  );

  const handleDragOver = (e: React.DragEvent) => {
    const types = e.dataTransfer?.types;
    if (types?.includes("text/plain") || types?.includes("rocket-file-path")) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const filePath = e.dataTransfer?.getData("rocket-file-path") || 
                     e.dataTransfer?.getData("text/plain");
    const api = apiRef.current;
    if (filePath && !filePath.endsWith("/") && api) {
      const project = localStorage.getItem("project");
      const absolutePath =
        project && !filePath.startsWith("/") ? `${project}/${filePath}` : filePath;
      const file = getFileObjectByPath(absolutePath);
      if (file && file.kind === "file") {
        const targetGroup = api.activeGroup || api.groups[0];
        const existingPanel = api.getPanel(file.id);
        
        if (existingPanel) {
          if (targetGroup) {
            existingPanel.api.moveTo({ group: targetGroup, position: "center" });
          }
        } else {
          api.addPanel({
            component: "editor",
            id: file.id,
            params: { fileId: file.id },
            renderer: "always",
            tabComponent: "editorTab",
            title: file.name,
            position: targetGroup
              ? { referencePanel: targetGroup.activePanel?.id || "", direction: "within" }
              : undefined,
          });
        }
        openFileByPath(filePath);
      }
    }
  };

  if (review) {
    return (
      <div id="code-area" className="code-area review-mode">
        <ReviewSurface />
      </div>
    );
  }

  return (
    <div
      id="code-area"
      className="code-area dock-editor"
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <DockviewReact
        components={components}
        defaultTabComponent={EditorTab}
        disableFloatingGroups
        disableTabsOverflowList
        dndStrategy="pointer"
        getTabContextMenuItems={() => [...tabMenu]}
        hideBorders
        keyboardNavigation={{
          keymap: {
            focusNextGroup: "cmd+shift+]",
            focusPrevGroup: "cmd+shift+[",
            nextTab: "ctrl+tab",
            prevTab: "ctrl+shift+tab",
          },
        }}
        noPanelsOverlay="watermark"
        onReady={handleReady}
        scrollbars="custom"
        tabComponents={tabComponents}
        theme={theme}
        watermarkComponent={EditorWatermark}
      />
    </div>
  );
}
