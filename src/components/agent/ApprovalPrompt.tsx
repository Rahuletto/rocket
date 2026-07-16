import type { AgentApproval } from "../../agent/protocol";

interface Props {
  approval: AgentApproval;
  onRespond: (
    id: string,
    decision: "accept" | "acceptForSession" | "decline",
  ) => void;
}

export default function ApprovalPrompt({ approval, onRespond }: Props) {
  return (
    <div className="agent-approval">
      <div>
        <strong>Approval required</strong>
        <p>{approval.description}</p>
      </div>
      <div className="agent-approval-actions">
        <button
          className="agent-button agent-button-primary"
          onClick={() => onRespond(approval.id, "accept")}
          type="button"
        >
          Allow
        </button>
        <button
          className="agent-button"
          onClick={() => onRespond(approval.id, "acceptForSession")}
          type="button"
        >
          Session
        </button>
        <button
          className="agent-button"
          onClick={() => onRespond(approval.id, "decline")}
          type="button"
        >
          Deny
        </button>
      </div>
    </div>
  );
}
