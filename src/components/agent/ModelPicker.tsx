import { useEffect, useMemo, useRef, useState } from "react";
import {
  PROVIDER_CATALOG,
  type ModelInfo,
  type ProviderId,
  allModels,
} from "../../agent/providers/catalog";
import {
  loadProviderStatuses,
  saveProviderConnection,
  type ProviderStatus,
} from "../../agent/providers/config";

export default function ModelPicker({
  modelId,
  onClose,
  onSelect,
  openConnectFor,
}: {
  modelId: string;
  onClose: () => void;
  onSelect: (model: ModelInfo) => void;
  openConnectFor?: ProviderId | null;
}) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [connectProvider, setConnectProvider] = useState<ProviderId | null>(
    openConnectFor ?? null,
  );
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [baseUrl, setBaseUrl] = useState("");
  const [statuses, setStatuses] = useState<ProviderStatus[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const refreshStatuses = async () => {
    try {
      setStatuses(await loadProviderStatuses());
    } catch (nextError) {
      setError(String(nextError));
    }
  };

  useEffect(() => {
    void refreshStatuses();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const models = useMemo(() => {
    const q = query.toLowerCase();
    return allModels().filter(
      (model) =>
        !q ||
        model.id.toLowerCase().includes(q) ||
        model.displayName.toLowerCase().includes(q) ||
        model.providerId.includes(q),
    );
  }, [query]);

  const isConnected = (providerId: ProviderId) =>
    statuses.some(
      (status) => status.providerId === providerId && status.connected,
    );

  const openConnection = (providerId: ProviderId) => {
    const provider = PROVIDER_CATALOG.find((entry) => entry.id === providerId);
    setConnectProvider(providerId);
    setBaseUrl(provider?.defaultBaseUrl ?? "");
    setCredentials({});
    setError("");
  };

  const saveConnection = async () => {
    if (!connectProvider) return;
    setSaving(true);
    setError("");
    try {
      await saveProviderConnection(connectProvider, credentials, baseUrl);
      await refreshStatuses();
      setConnectProvider(null);
    } catch (nextError) {
      setError(String(nextError));
    } finally {
      setSaving(false);
    }
  };

  if (connectProvider) {
    const provider = PROVIDER_CATALOG.find(
      (entry) => entry.id === connectProvider,
    );
    const fields = provider?.credentialFields ?? [];
    const requiresCredentials =
      provider?.authMethod === "api_key" &&
      connectProvider !== "openai-compatible";
    const credentialsComplete =
      !requiresCredentials ||
      fields.every((field) => credentials[field.key]?.trim());

    return (
      <div
        aria-label={`Connect ${provider?.name ?? connectProvider}`}
        aria-modal="true"
        className="agent-popover agent-model-picker"
        ref={popoverRef}
        role="dialog"
      >
        <header className="agent-popover-header">
          <strong>Connect {provider?.name ?? connectProvider}</strong>
          <button onClick={() => setConnectProvider(null)} type="button">
            Back
          </button>
        </header>
        <p className="agent-popover-hint">{provider?.description}</p>
        {provider?.authMethod === "binary" && (
          <p className="agent-popover-hint">
            {isConnected("codex")
              ? "Codex CLI found on PATH."
              : "Codex CLI not found on PATH."}
          </p>
        )}
        {fields.map((field) => (
          <label className="agent-field" key={field.key}>
            <span>{field.label}</span>
            <input
              autoComplete="off"
              onChange={(event) =>
                setCredentials((current) => ({
                  ...current,
                  [field.key]: event.target.value,
                }))
              }
              placeholder={field.key}
              type={field.secret ? "password" : "text"}
              value={credentials[field.key] ?? ""}
            />
          </label>
        ))}
        {(provider?.authMethod === "local" ||
          connectProvider === "openai-compatible") && (
          <label className="agent-field">
            <span>Base URL</span>
            <input
              autoFocus
              onChange={(event) => setBaseUrl(event.target.value)}
              placeholder={provider?.defaultBaseUrl}
              type="url"
              value={baseUrl}
            />
          </label>
        )}
        {error && <p className="agent-popover-error">{error}</p>}
        <div className="agent-popover-actions">
          <button onClick={onClose} type="button">
            Cancel
          </button>
          {provider?.authMethod !== "binary" && (
            <button
              className="agent-button-primary"
              disabled={saving || !credentialsComplete}
              onClick={() => void saveConnection()}
              type="button"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      aria-label="Select agent model"
      aria-modal="true"
      className="agent-popover agent-model-picker"
      ref={popoverRef}
      role="dialog"
    >
      <header className="agent-popover-header">
        <strong>Models</strong>
        <button onClick={onClose} type="button">
          Close
        </button>
      </header>
      <input
        aria-label="Search models"
        autoFocus
        className="agent-popover-search"
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search models…"
        value={query}
      />
      {error && <p className="agent-popover-error">{error}</p>}
      <div className="agent-model-list">
        {models.map((model) => {
          const connected = isConnected(model.providerId);
          const runtimeAvailable = model.engine === "codex";
          return (
            <button
              key={model.id}
              className={`agent-model-row ${
                model.id === modelId ? "active" : ""
              } ${runtimeAvailable ? "" : "unavailable"}`}
              disabled={connected && !runtimeAvailable}
              onClick={() => {
                if (!connected) {
                  openConnection(model.providerId);
                  return;
                }
                onSelect(model);
              }}
              title={
                runtimeAvailable
                  ? `Use ${model.displayName}`
                  : "Lava runtime ships in a later milestone"
              }
              type="button"
            >
              <span className="agent-model-name">{model.displayName}</span>
              <span className="agent-model-meta">
                {model.engine === "codex" ? "Codex" : "Lava · coming later"}
                {!connected ? " · connect" : ""}
              </span>
            </button>
          );
        })}
      </div>
      <div className="agent-provider-row" aria-label="Providers">
        {PROVIDER_CATALOG.map((provider) => (
          <button
            key={provider.id}
            className="agent-provider-chip"
            onClick={() => openConnection(provider.id)}
            type="button"
          >
            {provider.name}
            {isConnected(provider.id) ? " ✓" : ""}
          </button>
        ))}
      </div>
    </div>
  );
}
