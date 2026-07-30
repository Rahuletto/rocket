import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronLeft,
  Plug,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import {
  PROVIDER_CATALOG,
  type ModelInfo,
  type ProviderDef,
  type ProviderId,
  availableModels,
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
  const [focusedIndex, setFocusedIndex] = useState(0);

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

  const statusOf = (providerId: ProviderId) =>
    statuses.find((status) => status.providerId === providerId);

  const isConnected = (providerId: ProviderId) =>
    Boolean(statusOf(providerId)?.connected);

  const filteredModels = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return availableModels();
    return availableModels().filter(
      (model) =>
        model.id.toLowerCase().includes(q) ||
        model.displayName.toLowerCase().includes(q) ||
        model.providerId.includes(q),
    );
  }, [query]);

  // Providers that still have at least one matching model — preserves catalog order.
  const visibleProviders = useMemo(() => {
    const ids = new Set(filteredModels.map((model) => model.providerId));
    return PROVIDER_CATALOG.filter((provider) => ids.has(provider.id));
  }, [filteredModels]);

  // Flat list of visible models, in render order, for keyboard navigation.
  const flatModels = useMemo(
    () =>
      visibleProviders.flatMap((provider) =>
        provider.models.filter((model) =>
          filteredModels.some((filtered) => filtered.id === model.id),
        ),
      ),
    [filteredModels, visibleProviders],
  );

  useEffect(() => {
    setFocusedIndex(0);
  }, [query]);

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

  const activateModel = (model: ModelInfo) => {
    if (!isConnected(model.providerId)) {
      openConnection(model.providerId);
      return;
    }
    onSelect(model);
  };

  const onSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (flatModels.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setFocusedIndex((index) => (index + 1) % flatModels.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setFocusedIndex((index) =>
        index - 1 < 0 ? flatModels.length - 1 : index - 1,
      );
    } else if (event.key === "Enter") {
      event.preventDefault();
      const target = flatModels[focusedIndex] ?? flatModels[0];
      if (target) activateModel(target);
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
      !requiresCredentials || fields.every((field) => credentials[field.key]?.trim());

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
          <p className={`agent-popover-hint ${isConnected("codex") ? "" : "agent-popover-warn"}`}>
            {isConnected("codex")
              ? "Codex CLI found on PATH."
              : "Codex CLI not found on PATH — install it to use Codex models."}
          </p>
        )}
        {fields.map((field) => (
          <label className="agent-field" key={field.key}>
            <span>{field.label}</span>
            <input
              autoComplete="off"
              autoFocus
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
              autoFocus={fields.length === 0}
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
              className="agent-popover-connect"
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

  let runningIndex = -1;

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
          onKeyDown={onSearchKeyDown}
          placeholder="Search models…"
          value={query}
        />
      </div>
      {error && <p className="agent-popover-error">{error}</p>}
      <div className="agent-model-list">
        {visibleProviders.length === 0 ? (
          <p className="agent-model-empty">No models match “{query}”.</p>
        ) : (
          visibleProviders.map((provider: ProviderDef) => {
            const connected = isConnected(provider.id);
            const models = provider.models.filter((model) =>
              filteredModels.some((filtered) => filtered.id === model.id),
            );
            return (
              <section className="agent-model-group" key={provider.id}>
                <div className="agent-model-group-head">
                  <span
                    aria-hidden="true"
                    className={`agent-model-status ${connected ? "connected" : "disconnected"}`}
                    title={connected ? "Connected" : "Not connected"}
                  />
                  <span className="agent-model-group-name">{provider.name}</span>
                  {!connected && provider.authMethod !== "binary" && (
                    <button
                      className="agent-model-group-connect"
                      onClick={() => openConnection(provider.id)}
                      type="button"
                    >
                      <Plug size={11} />
                      Connect
                    </button>
                  )}
                </div>
                {models.map((model) => {
                  runningIndex += 1;
                  const flatIndex = runningIndex;
                  const isActive = model.id === modelId;
                  const selectable = connected;
                  const focused = flatIndex === focusedIndex;
                  return (
                    <button
                      key={model.id}
                      className={`agent-model-row ${isActive ? "active" : ""} ${
                        focused ? "focused" : ""
                      } ${selectable ? "" : "unavailable"}`}
                      disabled={!selectable}
                      onClick={() => activateModel(model)}
                      onMouseEnter={() => setFocusedIndex(flatIndex)}
                      title={
                        !connected
                          ? `Connect to ${provider.name} to use this model`
                          : `Use ${model.displayName}`
                      }
                      type="button"
                    >
                      <span className="agent-model-row-main">
                        <span className="agent-model-name">{model.displayName}</span>
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
              </section>
            );
          })
        )}
      </div>
      <footer className="agent-model-footer">
        <Sparkles size={11} />
        <span>↑↓ to navigate · ↵ to select · esc to close</span>
      </footer>
    </div>
  );
}
