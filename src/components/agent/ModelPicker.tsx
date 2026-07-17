import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronLeft,
  KeyRound,
  Search,
  X,
} from "lucide-react";
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
          <button
            aria-label="Back"
            className="agent-popover-back"
            onClick={() => setConnectProvider(null)}
            type="button"
          >
            <ChevronLeft size={16} />
          </button>
          <strong>Connect {provider?.name ?? connectProvider}</strong>
          <button
            aria-label="Close"
            className="agent-popover-close"
            onClick={onClose}
            type="button"
          >
            <X size={15} />
          </button>
        </header>
        {provider?.description && (
          <p className="agent-popover-hint">{provider.description}</p>
        )}
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
              placeholder={field.label}
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
              {saving ? "Saving…" : "Connect"}
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
        <button
          aria-label="Close"
          className="agent-popover-close"
          onClick={onClose}
          type="button"
        >
          <X size={15} />
        </button>
      </header>
      <div className="agent-popover-search-wrap">
        <Search size={13} />
        <input
          aria-label="Search models"
          autoFocus
          className="agent-popover-search"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search models…"
          value={query}
        />
      </div>
      {error && <p className="agent-popover-error">{error}</p>}
      <div className="agent-model-list">
        {models.map((model) => {
          const connected = isConnected(model.providerId);
          const runtimeAvailable = model.engine === "codex";
          const isActive = model.id === modelId;
          return (
            <button
              key={model.id}
              className={`agent-model-row ${isActive ? "active" : ""}`}
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
                  : "This model isn't available yet"
              }
              type="button"
            >
              <span className="agent-model-row-main">
                <span className="agent-model-name">{model.displayName}</span>
                <span className="agent-model-provider">
                  {PROVIDER_CATALOG.find((p) => p.id === model.providerId)
                    ?.name ?? model.providerId}
                </span>
              </span>
              <span className="agent-model-row-trail">
                {!connected && (
                  <span className="agent-model-connect">Connect</span>
                )}
                {isActive && <Check size={14} className="agent-model-check" />}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
