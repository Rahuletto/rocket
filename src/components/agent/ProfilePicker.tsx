import { useEffect, useState } from "react";
import { Check, ChevronLeft, Info, RefreshCw, X } from "lucide-react";
import { getProvider, type ModelInfo } from "../../agent/providers/catalog";
import {
  advertisedOptions,
  probeProfile,
  saveProfiles,
  type AgentProfile,
  type ProfileProbe,
} from "../../agent/profiles";

interface ProfilePickerProps {
  modelId: string;
  onClose: () => void;
  onProfiles: (profiles: AgentProfile[]) => void;
  onSelectModel: (model: ModelInfo) => void;
  onSelectProfile: (id: string) => void;
  profileId: string;
  profiles: AgentProfile[];
}

export default function ProfilePicker({
  modelId,
  onClose,
  onProfiles,
  onSelectModel,
  onSelectProfile,
  profileId,
  profiles,
}: ProfilePickerProps) {
  const [details, setDetails] = useState<AgentProfile>();
  const [probe, setProbe] = useState<ProfileProbe>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const codexModels = getProvider("codex")?.models ?? [];

  useEffect(() => setProbe(undefined), [details?.id]);

  const test = async (profile: AgentProfile) => {
    setBusy(true);
    setError("");
    try {
      setProbe(await probeProfile(profile.id));
    } catch (nextError) {
      setError(String(nextError));
    } finally {
      setBusy(false);
    }
  };

  const updateCustom = async (
    field: "command" | "args" | "envAllowlist",
    value: string,
  ) => {
    if (!details) return;
    const next = {
      ...details,
      [field]: field === "command"
        ? value
        : value.split(/\s*,\s*|\s+/).filter(Boolean),
    };
    setDetails(next);
    const all = profiles.map((profile) => profile.id === next.id ? next : profile);
    onProfiles(all);
    try {
      await saveProfiles(all);
    } catch (nextError) {
      setError(String(nextError));
    }
  };

  if (details) {
    const capabilities = details.lastCapabilitySnapshot;
    const agent = capabilities?.agentCapabilities ?? {};
    const options = advertisedOptions(details);
    return (
      <div className="agent-popover agent-model-picker" role="dialog" aria-label="Agent compatibility details">
        <header className="agent-popover-header">
          <button aria-label="Back" onClick={() => setDetails(undefined)} type="button"><ChevronLeft size={15} /></button>
          <strong>{details.displayName}</strong>
          <button aria-label="Close" onClick={onClose} type="button"><X size={15} /></button>
        </header>
        <div className="agent-profile-details">
          {details.experimental && <p className="agent-popover-warn">Experimental profile</p>}
          <p>{details.backendKind} · Rocket does not install or update this agent.</p>
          {details.id === "custom-acp" && (
            <>
              <label className="agent-field"><span>Command</span><input value={details.command} onChange={(event) => void updateCustom("command", event.target.value)} /></label>
              <label className="agent-field"><span>Arguments</span><input value={details.args.join(" ")} onChange={(event) => void updateCustom("args", event.target.value)} /></label>
              <label className="agent-field"><span>Safe environment names</span><input placeholder="PATH HOME" value={details.envAllowlist.join(" ")} onChange={(event) => void updateCustom("envAllowlist", event.target.value)} /></label>
            </>
          )}
          <button className="agent-popover-connect" disabled={busy} onClick={() => void test(details)} type="button">
            <RefreshCw size={12} /> {busy ? "Probing…" : "Probe executable"}
          </button>
          {probe && <p className={probe.found ? "" : "agent-popover-error"}>{probe.found ? `Found ${probe.executable}${probe.version ? ` — ${probe.version}` : ""}` : probe.error}</p>}
          {error && <p className="agent-popover-error">{error}</p>}
          <h4>Compatibility</h4>
          <dl className="agent-capability-grid">
            <dt>Protocol</dt><dd>{capabilities?.protocolVersion ? `ACP v${capabilities.protocolVersion}` : "Not negotiated"}</dd>
            <dt>Content</dt><dd>{capabilities ? Object.entries(capabilities.promptCapabilities).filter(([, value]) => value).map(([key]) => key).join(", ") || "text" : "Connect once to discover"}</dd>
            <dt>Sessions</dt><dd>{capabilities?.loadSession ? "load/resume" : "new only / unknown"}</dd>
            <dt>MCP</dt><dd>{String(agent.mcpCapabilities ?? "not advertised")}</dd>
            <dt>Plan/config</dt><dd>{options.length ? `${options.length} advertised option(s)` : String(agent.plan ?? "not advertised")}</dd>
            <dt>Permissions</dt><dd>{String(agent.permissionCapabilities ?? agent.permissions ?? "agent-defined")}</dd>
          </dl>
          {details.knownNotes.map((note) => <p key={note}><Info size={12} /> {note}</p>)}
        </div>
      </div>
    );
  }

  return (
    <div className="agent-popover agent-model-picker" role="dialog" aria-label="Select agent and model">
      <header className="agent-popover-header">
        <strong>Agent</strong>
        <button aria-label="Close" onClick={onClose} type="button"><X size={15} /></button>
      </header>
      <div className="agent-model-list">
        {profiles.map((profile) => {
          const selected = profile.id === profileId;
          return (
            <section className="agent-profile-group" key={profile.id}>
              <div className={`agent-model-row ${selected ? "active" : ""}`}>
                <button
                  className="agent-profile-select"
                  onClick={() => {
                    if (!selected) onSelectProfile(profile.id);
                    if (profile.backendKind === "acp-v1") onClose();
                  }}
                  type="button"
                >
                  <span>{profile.displayName}{profile.experimental && <small>Experimental</small>}</span>
                  {selected && <Check size={14} />}
                </button>
                <button aria-label={`Details for ${profile.displayName}`} className="agent-profile-info" onClick={() => setDetails(profile)} type="button"><Info size={14} /></button>
              </div>
              {selected && profile.backendKind === "codex-app-server" && (
                <div className="agent-profile-models">
                  <span className="agent-profile-models-label">Model</span>
                  {codexModels.map((model) => (
                    <button
                      className={`agent-model-row agent-profile-model-row ${model.id === modelId ? "active" : ""}`}
                      key={model.id}
                      onClick={() => onSelectModel(model)}
                      type="button"
                    >
                      <span className="agent-model-name">{model.displayName}</span>
                      {model.id === modelId && <Check size={14} />}
                    </button>
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>
      <p className="agent-popover-hint">ACP agents provide their own models and options after connecting.</p>
    </div>
  );
}
