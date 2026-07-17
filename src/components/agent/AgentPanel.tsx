import {
  ArrowUp,
  ChevronDown,
  Crosshair,
  FileDiff,
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
} from "react";
import {
  applyCompletion,
  buildCompletions,
  type CompletionItem,
} from "../../agent/composer/completion";
import { listWorkspaceFiles, listWorkspaceSkills } from "../../agent/discover";
import { findModel } from "../../agent/providers/catalog";
import { SLASH_COMMANDS } from "../../agent/slash/commands";
import { useAgent } from "../../provider/AgentContext";
import { useSource } from "../../provider/SourceContext";
import AgentMessage from "./AgentMessage";
import ApprovalPrompt from "./ApprovalPrompt";
import ComposerAutocomplete from "./ComposerAutocomplete";
import ComposerInput from "./ComposerInput";
import ModelPicker from "./ModelPicker";
import ToolActivity from "./ToolActivity";

export default function AgentPanel() {
  const { projectName } = useSource();
  const {
    activeTabId,
    closeTab,
    createTab,
    followAgent,
    interrupt,
    modelId,
    modelPickerOpen,
    respondApproval,
    send,
    setActiveTabId,
    setDraft,
    setFollowAgent,
    setModelId,
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
  const [skills, setSkills] = useState<string[]>([]);
  const [selectedCompletion, setSelectedCompletion] = useState(0);
  const [composerCursor, setComposerCursor] = useState(0);
  const [completionDismissed, setCompletionDismissed] = useState(false);

  const model = findModel(modelId);
  const modelLabel = model?.displayName ?? "Codex";

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
      sessions: tabs.map((tab) => ({ id: tab.id, name: tab.title })),
      skills,
    }),
    [files, skills, tabs],
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
        <div className="agent-tab-bar" role="tablist" aria-label="Agent chats">
          {tabs.map((tab) => {
            const selected = tab.id === activeTabId;
            const running = tab.state.status === "running";
            return (
              <div
                key={tab.id}
                className={`agent-tab ${selected ? "active" : ""}`}
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
                  <span className="agent-tab-title">{tab.title}</span>
                </button>
                <button
                  aria-label={`Close ${tab.title}`}
                  className="agent-tab-close"
                  onClick={(event) => {
                    event.stopPropagation();
                    closeTab(tab.id);
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
            <ModelPicker
              modelId={modelId}
              onClose={() => setModelPickerOpen(false)}
              onSelect={(next) => {
                setModelId(next.id);
                setModelPickerOpen(false);
              }}
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
            placeholder="Ask Agent · / commands · @ files · $ sessions · # skills"
            ref={textareaRef}
            value={prompt}
          />
        </div>
        <div className="agent-composer-footer">
          <div className="agent-composer-meta">
            <button
              className="agent-mode-chip"
              onClick={() => setModelPickerOpen((open) => !open)}
              title="Select model / connect providers"
              type="button"
            >
              {modelLabel}
              <ChevronDown size={12} />
            </button>
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
