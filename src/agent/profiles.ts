import { invoke } from "@tauri-apps/api/core";

export interface BackendCapabilities {
  backendId: string;
  protocolVersion?: number;
  loadSession: boolean;
  promptCapabilities: Record<string, boolean>;
  agentCapabilities: Record<string, unknown>;
  raw: Record<string, unknown>;
}
export interface AgentProfile {
  id: string; displayName: string; icon: string;
  backendKind: "codex-app-server" | "acp-v1";
  command: string; args: string[]; envAllowlist: string[];
  versionArg?: string; installationSource: string; updateStrategy: string;
  knownNotes: string[]; experimental: boolean;
  lastCapabilitySnapshot?: BackendCapabilities;
}
export interface ProfileProbe { found: boolean; executable?: string; version?: string; error?: string }
export const DEFAULT_AGENT_PROFILES: AgentProfile[] = [
  {
    args: ["app-server", "--stdio"],
    backendKind: "codex-app-server",
    command: "codex",
    displayName: "Codex",
    envAllowlist: ["PATH", "HOME", "TMPDIR"],
    experimental: false,
    icon: "bot",
    id: "codex-native",
    installationSource: "Codex CLI",
    knownNotes: ["Native Rocket integration with full streaming and approvals."],
    updateStrategy: "managed externally",
    versionArg: "--version",
  },
];
export const isRunnableProfile = (profile?: AgentProfile) =>
  profile?.backendKind === "codex-app-server";
export const loadProfiles = () => invoke<AgentProfile[]>("agent_profiles");
export const saveProfiles = (profiles: AgentProfile[]) => invoke("agent_save_profiles", { profiles });
export const probeProfile = (profileId: string) => invoke<ProfileProbe>("agent_probe_profile", { profileId });

export function advertisedOptions(profile?: AgentProfile) {
  const raw = profile?.lastCapabilitySnapshot?.raw;
  const session = raw && typeof raw === "object" ? (raw.session as Record<string, unknown> | undefined) : undefined;
  const values = session?.configOptions ?? raw?.configOptions;
  return Array.isArray(values) ? values as Array<Record<string, unknown>> : [];
}
