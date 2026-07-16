import {
  ArrowUp,
  Crosshair,
  FileDiff,
  LoaderCircle,
  Plus,
  Square,
  X,
} from "lucide-react";
import { type FormEvent, useEffect, useRef } from "react";
import { useAgent } from "../../provider/AgentContext";
import AgentMessage from "./AgentMessage";
import ApprovalPrompt from "./ApprovalPrompt";
import ToolActivity from "./ToolActivity";

export default function AgentPanel() {
  const {
    activeTabId,
    closeTab,
    createTab,
    followAgent,
    interrupt,
    respondApproval,
    send,
    setActiveTabId,
    setDraft,
    setFollowAgent,
    state,
    tabs,
  } = useAgent();
  const scrollRef = useRef<HTMLDivElement>(null);
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

  useEffect(() => {
    scrollRef.current?.scrollTo({
      behavior: "auto",
      top: scrollRef.current.scrollHeight,
    });
  }, [activeTabId, state.messages, state.reasoning, tools.length]);

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
        <textarea
          aria-label="Message agent"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
          placeholder="Ask Agent"
          rows={1}
          value={prompt}
        />
        <div className="agent-composer-footer">
          <div className="agent-composer-meta" />
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
