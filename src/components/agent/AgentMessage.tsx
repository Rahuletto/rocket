import { lazy, Suspense } from "react";
import { code } from "@streamdown/code";
import type { AgentMessage as AgentMessageType } from "../../agent/protocol";

const Streamdown = lazy(() =>
  import("streamdown").then((module) => ({ default: module.Streamdown })),
);

export default function AgentMessage({
  message,
}: {
  message: AgentMessageType;
}) {
  if (message.role === "user") {
    return (
      <div className="agent-user-message">
        <p>{message.text}</p>
      </div>
    );
  }

  return (
    <div className="agent-assistant-message">
      <Suspense fallback={<p className="agent-markdown">{message.text}</p>}>
        <Streamdown
          animated={message.status === "streaming"}
          caret={message.status === "streaming" ? "block" : undefined}
          className="agent-markdown"
          controls={{ code: true, table: false }}
          mode={message.status === "streaming" ? "streaming" : "static"}
          plugins={{ code }}
          shikiTheme={["github-light", "github-dark"]}
        >
          {message.text}
        </Streamdown>
      </Suspense>
    </div>
  );
}
