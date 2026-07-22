import {
  ArrowUp,
  Bot,
  CircleAlert,
  ChevronDown,
  Crosshair,
  FileCode2,
  FileDiff,
  GitBranch,
  LoaderCircle,
  Plus,
  Square,
  X,
} from "lucide-react";
import {
  type FormEvent,
  type KeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  applyCompletion,
  buildCompletions,
  type CompletionItem,
} from "../../agent/composer/completion";
import {
  listWorkspaceFiles,
  listWorkspaceSkills,
  type AgentSkillReference,
} from "../../agent/discover";
import { findModel } from "../../agent/providers/catalog";
import { SLASH_COMMANDS } from "../../agent/slash/commands";
import { deriveTabStatus } from "../../agent/protocol";
import { useAgent } from "../../provider/AgentContext";
import { useReview, type ReviewFile } from "../../provider/ReviewContext";
import { useSource } from "../../provider/SourceContext";
import { invoke } from "@tauri-apps/api/core";
import { advertisedOptions } from "../../agent/profiles";
import AgentMessage from "./AgentMessage";
import ApprovalPrompt from "./ApprovalPrompt";
import ComposerAutocomplete from "./ComposerAutocomplete";
import ComposerInput from "./ComposerInput";
import ProfilePicker from "./ProfilePicker";
import ToolActivity from "./ToolActivity";
import WorktreeControls from "./WorktreeControls";
import {
  getEditorContext,
  subscribeEditorContext,
  toWorkspaceRelativePath,
} from "../../agent/editorContext";
import { useGit } from "../../provider/GitContext";

export default function AgentPanel() {
  const { projectName } = useSource();
  const { openReview } = useReview();
  const { diff } = useGit();
  const {
    activeTabId,
    closeTab,
    createTab,
    followAgent,
    interrupt,
    modelId,
    modelPickerOpen,
    profileId,
    profiles,
    updateProfiles,
    respondApproval,
    send,
    setActiveTabId,
    setDraft,
    setFollowAgent,
    setModelId,
    setProfileId,
    setModelPickerOpen,
    state,
    tabs,
  } = useAgent();
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0];
  const prompt = activeTab?.draft ?? "";

  const tools = Object.values(state.tools);
  const isEmpty =
    state.messages.length === 0 &&
    tools.length === 0 &&
    !state.reasoning &&
    state.approvals.length === 0 &&
    !state.error;
  const canSend = Boolean(prompt.trim()) && state.status !== "running";

  const [files, setFiles] = useState<string[]>([]);
  const [skills, setSkills] = useState<AgentSkillReference[]>([]);
  const [selectedCompletion, setSelectedCompletion] = useState(0);
  const [composerCursor, setComposerCursor] = useState(0);
  const [completionDismissed, setCompletionDismissed] = useState(false);
  const editorContext = useSyncExternalStore(
    subscribeEditorContext,
    getEditorContext,
    getEditorContext,
  );

  const model = findModel(modelId);
  const selectedProfile = profiles.find((profile) => profile.id === profileId);
  const advertised=advertisedOptions(selectedProfile);
  const profileLabel = selectedProfile?.displayName ?? "Codex";
  const modelLabel = model?.displayName ?? "Default model";
  const fetchChanges = async (): Promise<ReviewFile[]> => {
    const workspace = projectName || localStorage.getItem("project") || "";
    return Promise.all(
      state.changedFiles.map(async (file) => {
        const path = toWorkspaceRelativePath(file.path, workspace);
        return {
          additions: file.additions,
          deletions: file.deletions,
          kind: "modified" as const,
          patch: await diff(path, false),
          path,
        };
      }),
    );
  };
  const reviewChanges = async () => {
    try {
      const files = await fetchChanges();
      openReview({
        files,
        source: "agent",
        title: activeTab?.title ?? "Agent changes",
        onRefresh: fetchChanges,
      });
    } catch (error) { alert(String(error)); }
  };

  useEffect(() => {
    const workspace = projectName || localStorage.getItem("project");
    if (!workspace) return;
    let cancelled = false;
    void Promise.all([
      listWorkspaceFiles(workspace),
      listWorkspaceSkills(workspace),
    ]).then(([nextFiles, nextSkills]) => {
      if (cancelled) return;
      setFiles(nextFiles);
      setSkills(nextSkills);
    });
    return () => {
      cancelled = true;
    };
  }, [projectName]);

  const completionSources = useMemo(
    () => ({
      commands: SLASH_COMMANDS.map((command) => ({
        description: command.description,
        name: command.name,
      })),
      files,
      sessions: tabs
        .filter((tab) => tab.id !== activeTabId)
        .map((tab) => ({ id: tab.id, name: tab.title })),
      skills,
    }),
    [activeTabId, files, skills, tabs],
  );

  const completions = useMemo(
    () =>
      completionDismissed
        ? []
        : buildCompletions(prompt, completionSources, composerCursor),
    [completionDismissed, completionSources, composerCursor, prompt],
  );

  // Clamp during render so Enter/Tab never accept a stale out-of-range index.
  const safeSelectedCompletion =
    completions.length === 0
      ? 0
      : Math.min(selectedCompletion, completions.length - 1);

  useEffect(() => {
    setSelectedCompletion(0);
  }, [prompt, composerCursor]);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      behavior: "auto",
      top: scrollRef.current.scrollHeight,
    });
  }, [activeTabId, state.messages, state.reasoning, tools.length]);

  const acceptCompletion = (item: CompletionItem) => {
    const next = applyCompletion(prompt, item, composerCursor);
    setDraft(next.text);
    setComposerCursor(next.cursor);
    setCompletionDismissed(true);
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(next.cursor, next.cursor);
    });
  };

  const onComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (completions.length > 0) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSelectedCompletion(
          (index) => (Math.min(index, completions.length - 1) + 1) % completions.length,
        );
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setSelectedCompletion((index) => {
          const current = Math.min(index, completions.length - 1);
          return (current - 1 + completions.length) % completions.length;
        });
        return;
      }
      if (event.key === "Tab" || (event.key === "Enter" && !event.shiftKey)) {
        event.preventDefault();
        acceptCompletion(
          completions[safeSelectedCompletion] ?? completions[0],
        );
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setCompletionDismissed(true);
        return;
      }
    }

    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSend) return;
    const value = prompt;
    setDraft("");
    await send(value);
  };

  return (
    <aside className="agent-panel">
      <header className="agent-panel-header">
        {state.runtimeContext === "restored" &&
          state.runtimeConnection === "offline" && (
            <span
              className="agent-runtime-state"
              title="The transcript and review state were restored, but the agent runtime did not resume. Sending starts a new runtime context."
            >
              Restored · runtime offline
            </span>
          )}
        <div className="agent-tab-bar" role="tablist" aria-label="Agent chats">
          {tabs.map((tab) => {
            const selected = tab.id === activeTabId;
            const status = deriveTabStatus(tab.state);
            const running = status === "running";
            const waiting = status === "waiting";
            const error = status === "error";
            const queueCount = tab.queue.length;
            return (
              <div
                key={tab.id}
                className={`agent-tab ${selected ? "active" : ""} agent-tab-${status}`}
                role="presentation"
              >
                <button
                  aria-selected={selected}
                  className="agent-tab-button"
                  onClick={() => setActiveTabId(tab.id)}
                  role="tab"
                  title={tab.title}
                  type="button"
                >
                  {running && (
                    <LoaderCircle className="agent-spinner" size={11} />
                  )}
                  {waiting && (
                    <span className="agent-tab-dot agent-tab-dot-waiting" />
                  )}
                  {error && (
                    <span className="agent-tab-dot agent-tab-dot-error" />
                  )}
                  <span className="agent-tab-title">{tab.title}</span>
                  {queueCount > 0 && (
                    <span className="agent-tab-queue" title={`${queueCount} queued`}>
                      {queueCount}
                    </span>
                  )}
                </button>
                <button
                  aria-label={`Close ${tab.title}`}
                  className="agent-tab-close"
                  onClick={async (event) => {
                    event.stopPropagation();
                    await closeTab(tab.id);
                  }}
                  type="button"
                >
                  <X size={12} />
                </button>
              </div>
            );
          })}
          <button
            aria-label="New agent chat"
            className="agent-icon-button agent-tab-add"
            onClick={createTab}
            title="New chat"
            type="button"
          >
            <Plus size={15} />
          </button>
        </div>
        <div className="agent-header-actions">
          {state.changedFiles.length > 0 && (
            <button
              aria-label={`${state.changedFiles.length} changed files`}
              className="agent-icon-button"
              onClick={() => void reviewChanges()}
              title="Review changes"
              type="button"
            >
              <FileDiff size={15} />
              <span>{state.changedFiles.length}</span>
            </button>
          )}
        </div>
      </header>

      <div className="agent-transcript" ref={scrollRef}>
        {activeTab?.workspaceMode === "isolated-worktree" && state.sessionId && <WorktreeControls sessionId={activeTabId} onDiscard={async () => { await closeTab(activeTabId); }} />}
        {isEmpty ? (
          <div className="agent-empty" />
        ) : (
          <>
            {state.messages.map((message) => (
              <AgentMessage key={message.id} message={message} />
            ))}
            {state.reasoning && (
              <details className="agent-reasoning">
                <summary>Thinking</summary>
                <p>{state.reasoning}</p>
              </details>
            )}
            {tools.length > 0 && (
              <section className="agent-activity" aria-label="Tool activity">
                {tools.map((tool) => (
                  <ToolActivity key={tool.id} tool={tool} />
                ))}
              </section>
            )}
            {state.approvals.map((approval) => (
              <ApprovalPrompt
                approval={approval}
                key={approval.id}
                onRespond={respondApproval}
              />
            ))}
            {state.error && <div className="agent-error">{state.error}</div>}
          </>
        )}
      </div>

      <form className="agent-composer" onSubmit={submit}>
        {editorContext && (
          <div className="agent-context-strip" aria-label="Editor context sent with prompts">
            <span title={editorContext.path}>
              <FileCode2 size={12} />
              {editorContext.path.split(/[\\/]/).pop()}
            </span>
            <span>
              {editorContext.selection
                ? `L${editorContext.selection.startLine}–${editorContext.selection.endLine}`
                : `L${editorContext.cursor.line}`}
            </span>
            {editorContext.diagnostics.length > 0 && (
              <span title="Current editor diagnostics are included">
                <CircleAlert size={12} />
                {editorContext.diagnostics.length}
              </span>
            )}
          </div>
        )}
        <div className="agent-composer-body">
          {completions.length > 0 && (
            <ComposerAutocomplete
              items={completions}
              onHover={setSelectedCompletion}
              onSelect={acceptCompletion}
              selectedIndex={safeSelectedCompletion}
            />
          )}
          {modelPickerOpen && (
            <ProfilePicker
              modelId={modelId}
              profiles={profiles}
              profileId={profileId}
              onProfiles={updateProfiles}
              onClose={() => setModelPickerOpen(false)}
              onSelectModel={(nextModel) => {
                setModelId(nextModel.id);
                setModelPickerOpen(false);
              }}
              onSelectProfile={setProfileId}
            />
          )}
          <ComposerInput
            aria-label="Message agent"
            aria-autocomplete="list"
            aria-controls={
              completions.length > 0 ? "agent-composer-completions" : undefined
            }
            aria-expanded={completions.length > 0}
            onChange={(event) => {
              setDraft(event.target.value);
              setComposerCursor(event.target.selectionStart);
              setCompletionDismissed(false);
            }}
            onClick={(event) => {
              setComposerCursor(event.currentTarget.selectionStart);
              setCompletionDismissed(false);
            }}
            onKeyUp={(event) => {
              if (
                !["ArrowDown", "ArrowUp", "Enter", "Escape", "Tab"].includes(
                  event.key,
                )
              ) {
                setComposerCursor(event.currentTarget.selectionStart);
              }
            }}
            onKeyDown={onComposerKeyDown}
            placeholder="Message agent…"
            ref={textareaRef}
            value={prompt}
          />
        </div>
        <div className="agent-composer-footer">
          <div className="agent-composer-meta">
            <span
              aria-label={
                activeTab?.workspaceMode === "isolated-worktree"
                  ? "Agent workspace: isolated worktree based on HEAD"
                  : "Agent workspace: current workspace"
              }
              className="agent-mode-chip agent-workspace-chip"
              title={
                activeTab?.workspaceMode === "isolated-worktree"
                  ? "Changes are isolated in a Git worktree based on HEAD"
                  : "Agent reads and edits the open workspace"
              }
            >
              <GitBranch size={12} />
              <span>{activeTab?.workspaceMode === "isolated-worktree" ? "Worktree" : "Workspace"}</span>
              {activeTab?.workspaceMode === "isolated-worktree" && !state.sessionId && <small>HEAD</small>}
            </span>
            <button
              aria-expanded={modelPickerOpen}
              className="agent-mode-chip agent-profile-chip agent-runtime-chip"
              onClick={() => setModelPickerOpen((open) => !open)}
              title={selectedProfile?.backendKind === "acp-v1" ? `Agent: ${profileLabel}` : `Agent: ${profileLabel} · Model: ${modelLabel}`}
              type="button"
            >
              <Bot size={12} />
              <span>{selectedProfile?.backendKind === "acp-v1" ? profileLabel : `${profileLabel} · ${modelLabel.replace(/^Codex · /, "").replace("Codex (default)", "Default")}`}</span>
              <ChevronDown size={12} />
            </button>
            {selectedProfile?.backendKind==="acp-v1"&&advertised.map((option,index)=>{const values=(option.options??option.values) as Array<Record<string,unknown>>|undefined;if(!Array.isArray(values)||values.length===0)return null;const id=String(option.id??index);return <select aria-label={String(option.name??option.title??id)} key={id} defaultValue={String(option.currentValue??option.value??values[0]?.value??values[0]?.id)} onChange={event=>void invoke("agent_set_config_option",{sessionId:activeTabId,optionId:id,value:event.target.value})}>{values.map((value,i)=>{const opaque=String(value.value??value.id??i);return <option key={opaque} value={opaque}>{String(value.name??value.label??opaque)}</option>})}</select>})}
          </div>
          <div className="agent-composer-actions">
            <button
              aria-label={
                followAgent ? "Stop following agent" : "Follow agent edits"
              }
              aria-pressed={followAgent}
              className={`agent-icon-button ${followAgent ? "active" : ""}`}
              onClick={() => setFollowAgent(!followAgent)}
              title="Follow agent"
              type="button"
            >
              <Crosshair size={15} />
            </button>
            {state.status === "running" ? (
              <button
                aria-label="Stop agent"
                className="agent-send agent-send-stop"
                onClick={interrupt}
                type="button"
              >
                <Square fill="currentColor" size={11} />
              </button>
            ) : (
              <button
                aria-label="Send message"
                className="agent-send"
                disabled={!canSend}
                type="submit"
              >
                <ArrowUp size={15} strokeWidth={2.5} />
              </button>
            )}
          </div>
        </div>
      </form>
    </aside>
  );
}
