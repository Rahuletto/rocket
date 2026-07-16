import {
  Check,
  ChevronDown,
  Circle,
  FilePenLine,
  Search,
  Terminal,
  Wrench,
  X,
} from "lucide-react";
import { useState } from "react";
import type { AgentTool } from "../../agent/protocol";

const icons = {
  command: Terminal,
  file: FilePenLine,
  search: Search,
  tool: Wrench,
};

export default function ToolActivity({ tool }: { tool: AgentTool }) {
  const [expanded, setExpanded] = useState(false);
  const Icon = icons[tool.kind];
  const StatusIcon =
    tool.status === "completed"
      ? Check
      : tool.status === "failed"
        ? X
        : Circle;

  return (
    <div className={`agent-tool agent-tool-${tool.status}`}>
      <button
        aria-expanded={expanded}
        className="agent-tool-header"
        onClick={() => setExpanded((value) => !value)}
        type="button"
      >
        <Icon aria-hidden="true" size={14} />
        <span className="agent-tool-label">{tool.label}</span>
        <StatusIcon
          aria-hidden="true"
          className={tool.status === "running" ? "agent-tool-running" : ""}
          size={13}
        />
        <ChevronDown
          aria-hidden="true"
          className={expanded ? "agent-chevron-open" : ""}
          size={13}
        />
      </button>
      {expanded && (
        <div className="agent-tool-details">
          {tool.path && <div className="agent-tool-path">{tool.path}</div>}
          {tool.output && <pre>{tool.output}</pre>}
        </div>
      )}
    </div>
  );
}
