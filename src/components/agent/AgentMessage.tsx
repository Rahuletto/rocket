import { lazy, Suspense, useState } from "react";
import { code } from "@streamdown/code";
import { Check, Copy } from "lucide-react";
import type { AgentMessage as AgentMessageType } from "../../agent/protocol";

const Streamdown = lazy(() =>
  import("streamdown").then((module) => ({ default: module.Streamdown })),
);

export default function AgentMessage({
  message,
}: {
  message: AgentMessageType;
}) {
  const [copied, setCopied] = useState(false);

  if (message.role === "user") {
    return (
      <div className="agent-user-message">
        <p>{message.text}</p>
      </div>
    );
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* clipboard unavailable — fail silently */
    }
  };

  const streaming = message.status === "streaming";

  return (
    <div className="agent-assistant-message">
      <div className="agent-assistant-actions">
        {streaming && (
          <span className="agent-streaming" aria-live="polite">
            <span className="agent-streaming-dot" />
            Generating
          </span>
        )}
        <button
          aria-label={copied ? "Copied" : "Copy message"}
          className="agent-copy"
          onClick={() => void copy()}
          title={copied ? "Copied" : "Copy"}
          type="button"
        >
          {copied ? <Check size={13} /> : <Copy size={13} />}
        </button>
      </div>
      <Suspense fallback={<p className="agent-markdown">{message.text}</p>}>
        <Streamdown
          animated={streaming}
          caret={streaming ? "block" : undefined}
          className="agent-markdown"
          controls={{ code: true, table: false }}
          mode={streaming ? "streaming" : "static"}
          plugins={{ code }}
          shikiTheme={["github-light", "github-dark"]}
        >
          {message.text}
        </Streamdown>
      </Suspense>
    </div>
  );
}
