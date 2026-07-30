export type ProviderId =
  | "codex"
  | "anthropic"
  | "openai"
  | "openrouter"
  | "cloudflare-workers-ai"
  | "ollama"
  | "lm-studio"
  | "openai-compatible";

export type AgentEngine = "codex" | "flue";

export type AuthMethod = "api_key" | "binary" | "local" | "env";

export interface ModelInfo {
  displayName: string;
  engine: AgentEngine;
  id: string;
  providerId: ProviderId;
}

export interface ProviderDef {
  authMethod: AuthMethod;
  credentialFields?: Array<{ key: string; label: string; secret?: boolean }>;
  defaultBaseUrl?: string;
  description: string;
  envKeys?: string[];
  id: ProviderId;
  models: ModelInfo[];
  name: string;
}

export const PROVIDER_CATALOG: ProviderDef[] = [
  {
    authMethod: "binary",
    description: "Local Codex CLI (default). Requires `codex` on PATH.",
    id: "codex",
    models: [
      {
        displayName: "Codex (default)",
        engine: "codex",
        id: "codex/default",
        providerId: "codex",
      },
    ],
    name: "Codex",
  },
  {
    authMethod: "api_key",
    credentialFields: [
      { key: "ANTHROPIC_API_KEY", label: "API key", secret: true },
    ],
    description: "Anthropic Claude API (Lava / Flue runtime).",
    envKeys: ["ANTHROPIC_API_KEY"],
    id: "anthropic",
    models: [
      {
        displayName: "Claude Sonnet 4",
        engine: "flue",
        id: "anthropic/claude-sonnet-4-20250514",
        providerId: "anthropic",
      },
      {
        displayName: "Claude 3.5 Sonnet",
        engine: "flue",
        id: "anthropic/claude-3-5-sonnet-20241022",
        providerId: "anthropic",
      },
    ],
    name: "Anthropic",
  },
  {
    authMethod: "api_key",
    credentialFields: [
      { key: "OPENAI_API_KEY", label: "API key", secret: true },
    ],
    description: "OpenAI API (Lava runtime, or via Codex when using Codex).",
    envKeys: ["OPENAI_API_KEY"],
    id: "openai",
    models: [
      {
        displayName: "GPT-4o",
        engine: "flue",
        id: "openai/gpt-4o",
        providerId: "openai",
      },
      {
        displayName: "GPT-4.1",
        engine: "flue",
        id: "openai/gpt-4.1",
        providerId: "openai",
      },
    ],
    name: "OpenAI",
  },
  {
    authMethod: "api_key",
    credentialFields: [
      { key: "OPENROUTER_API_KEY", label: "API key", secret: true },
    ],
    description: "OpenRouter multi-provider gateway.",
    envKeys: ["OPENROUTER_API_KEY"],
    id: "openrouter",
    models: [
      {
        displayName: "OpenRouter · auto",
        engine: "flue",
        id: "openrouter/auto",
        providerId: "openrouter",
      },
    ],
    name: "OpenRouter",
  },
  {
    authMethod: "api_key",
    credentialFields: [
      { key: "CF_ACCOUNT_ID", label: "Account ID" },
      { key: "CF_API_TOKEN", label: "API token", secret: true },
    ],
    description: "Cloudflare Workers AI (lavalamp-style).",
    envKeys: ["CF_API_TOKEN", "CF_ACCOUNT_ID"],
    id: "cloudflare-workers-ai",
    models: [
      {
        displayName: "GLM 4.7 Flash",
        engine: "flue",
        id: "cloudflare-workers-ai/@cf/zai-org/glm-4.7-flash",
        providerId: "cloudflare-workers-ai",
      },
      {
        displayName: "Kimi K2.7 Code",
        engine: "flue",
        id: "cloudflare-workers-ai/@cf/moonshotai/kimi-k2.7-code",
        providerId: "cloudflare-workers-ai",
      },
    ],
    name: "Cloudflare Workers AI",
  },
  {
    authMethod: "local",
    defaultBaseUrl: "http://127.0.0.1:11434/v1",
    description: "Local Ollama OpenAI-compatible endpoint.",
    id: "ollama",
    models: [
      {
        displayName: "Ollama · llama3.2",
        engine: "flue",
        id: "ollama/llama3.2",
        providerId: "ollama",
      },
    ],
    name: "Ollama",
  },
  {
    authMethod: "local",
    defaultBaseUrl: "http://127.0.0.1:1234/v1",
    description: "LM Studio local server.",
    id: "lm-studio",
    models: [
      {
        displayName: "LM Studio · local",
        engine: "flue",
        id: "lm-studio/local",
        providerId: "lm-studio",
      },
    ],
    name: "LM Studio",
  },
  {
    authMethod: "api_key",
    credentialFields: [
      {
        key: "OPENAI_COMPATIBLE_API_KEY",
        label: "API key (optional)",
        secret: true,
      },
    ],
    defaultBaseUrl: "http://127.0.0.1:8080/v1",
    description: "Any OpenAI-compatible base URL.",
    id: "openai-compatible",
    models: [
      {
        displayName: "Custom OpenAI-compatible",
        engine: "flue",
        id: "openai-compatible/default",
        providerId: "openai-compatible",
      },
    ],
    name: "OpenAI-compatible",
  },
];

export function allModels(): ModelInfo[] {
  return PROVIDER_CATALOG.flatMap((provider) => provider.models);
}

export function availableModels(): ModelInfo[] {
  return allModels().filter((model) => model.engine === "codex");
}

export function findAvailableModel(modelId: string): ModelInfo | undefined {
  return availableModels().find((model) => model.id === modelId);
}

export function findModel(modelId: string): ModelInfo | undefined {
  return allModels().find((model) => model.id === modelId);
}

export function getProvider(id: ProviderId): ProviderDef | undefined {
  return PROVIDER_CATALOG.find((provider) => provider.id === id);
}

export function isModelSelectionChange(
  currentModelId: string,
  nextModelId: string,
): boolean {
  return currentModelId !== nextModelId;
}

export const DEFAULT_MODEL_ID = "codex/default";

/** Model id passed to Codex app-server (null = codex default). */
export function codexModelArg(modelId: string | undefined): string | null {
  if (!modelId || modelId === "codex/default") return null;
  const model = findModel(modelId);
  if (model?.engine !== "codex") return null;
  return model.id.replace(/^codex\//, "");
}
