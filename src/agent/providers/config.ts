import { invoke } from "@tauri-apps/api/core";
import {
  DEFAULT_MODEL_ID,
  type ProviderId,
  findAvailableModel,
} from "./catalog";

export interface AgentUserConfig {
  baseUrls: Partial<Record<ProviderId, string>>;
  defaultModelId: string;
  selectedProfileId: string;
  planMode: boolean;
}

export interface ProviderStatus {
  connected: boolean;
  providerId: ProviderId;
  source?: "binary" | "credentials" | "environment" | "local" | null;
}

export const DEFAULT_AGENT_CONFIG: AgentUserConfig = {
  baseUrls: {},
  defaultModelId: DEFAULT_MODEL_ID,
  selectedProfileId: "codex-native",
  planMode: false,
};

function normalizeConfig(value: Partial<AgentUserConfig>): AgentUserConfig {
  return {
    ...DEFAULT_AGENT_CONFIG,
    ...value,
    baseUrls: {
      ...DEFAULT_AGENT_CONFIG.baseUrls,
      ...(value.baseUrls ?? {}),
    },
    defaultModelId: findAvailableModel(value.defaultModelId ?? "")
      ? (value.defaultModelId ?? DEFAULT_MODEL_ID)
      : DEFAULT_MODEL_ID,
  };
}

export async function loadAgentConfig(): Promise<AgentUserConfig> {
  await migrateLegacyAgentStorage();
  const config = await invoke<Partial<AgentUserConfig>>("agent_load_config");
  return normalizeConfig(config);
}

export async function saveAgentConfig(config: AgentUserConfig): Promise<void> {
  await invoke("agent_save_config", { config: normalizeConfig(config) });
}

export async function saveProviderConnection(
  providerId: ProviderId,
  credentials: Record<string, string>,
  baseUrl?: string,
): Promise<void> {
  await invoke("agent_save_provider_connection", {
    baseUrl: baseUrl?.trim() || null,
    credentials,
    providerId,
  });
}

export async function loadProviderStatuses(): Promise<ProviderStatus[]> {
  return invoke<ProviderStatus[]>("agent_provider_statuses");
}

async function migrateLegacyAgentStorage(): Promise<void> {
  const legacyConfig = localStorage.getItem("rocket.agent.config");
  const legacySecrets = localStorage.getItem("rocket.agent.secrets");
  if (!legacyConfig && !legacySecrets) return;

  if (legacyConfig) {
    try {
      await saveAgentConfig(normalizeConfig(JSON.parse(legacyConfig)));
      localStorage.removeItem("rocket.agent.config");
    } catch {
      // Keep legacy config for retry on next launch.
    }
  }

  if (legacySecrets) {
    try {
      const parsed = JSON.parse(legacySecrets) as {
        apiKeys?: Partial<Record<ProviderId, string>>;
      };
      for (const [providerId, apiKey] of Object.entries(parsed.apiKeys ?? {})) {
        const provider = providerId as ProviderId;
        const legacyKeyMap: Partial<Record<ProviderId, string>> = {
          anthropic: "ANTHROPIC_API_KEY",
          openai: "OPENAI_API_KEY",
          openrouter: "OPENROUTER_API_KEY",
          "cloudflare-workers-ai": "CF_API_TOKEN",
          "openai-compatible": "OPENAI_COMPATIBLE_API_KEY",
        };
        const key = legacyKeyMap[provider];
        if (key && apiKey?.trim()) {
          await saveProviderConnection(provider, { [key]: apiKey.trim() });
        }
      }
      localStorage.removeItem("rocket.agent.secrets");
    } catch {
      // Keep legacy secrets for retry; never expose them through app state.
    }
  }
}
