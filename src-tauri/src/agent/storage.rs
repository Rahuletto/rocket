use serde::Serialize;
use serde_json::{json, Map, Value};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use tauri::{AppHandle, Manager};

const PROVIDERS: &[&str] = &[
    "codex",
    "anthropic",
    "openai",
    "openrouter",
    "cloudflare-workers-ai",
    "ollama",
    "lm-studio",
    "openai-compatible",
];

const PROVIDER_ENV_KEYS: &[(&str, &[&str])] = &[
    ("anthropic", &["ANTHROPIC_API_KEY"]),
    ("openai", &["OPENAI_API_KEY"]),
    ("openrouter", &["OPENROUTER_API_KEY"]),
    ("cloudflare-workers-ai", &["CF_API_TOKEN", "CF_ACCOUNT_ID"]),
    ("openai-compatible", &["OPENAI_COMPATIBLE_API_KEY"]),
];

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderStatus {
    provider_id: String,
    connected: bool,
    source: Option<&'static str>,
}

fn rocket_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .home_dir()
        .map_err(|error| error.to_string())?
        .join(".rocket");
    fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    set_private_dir_permissions(&dir)?;
    Ok(dir)
}

fn read_json(path: &Path, fallback: Value) -> Result<Value, String> {
    match fs::read_to_string(path) {
        Ok(contents) => serde_json::from_str(&contents).map_err(|error| error.to_string()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(fallback),
        Err(error) => Err(error.to_string()),
    }
}

fn write_json_private(path: &Path, value: &Value) -> Result<(), String> {
    let temp = path.with_extension(format!("tmp-{}", std::process::id()));
    let bytes = serde_json::to_vec_pretty(value).map_err(|error| error.to_string())?;
    fs::write(&temp, bytes).map_err(|error| error.to_string())?;
    set_private_file_permissions(&temp)?;
    fs::rename(&temp, path).map_err(|error| error.to_string())?;
    set_private_file_permissions(path)
}

#[cfg(unix)]
fn set_private_dir_permissions(path: &Path) -> Result<(), String> {
    use std::os::unix::fs::PermissionsExt;
    fs::set_permissions(path, fs::Permissions::from_mode(0o700)).map_err(|error| error.to_string())
}

#[cfg(not(unix))]
fn set_private_dir_permissions(_path: &Path) -> Result<(), String> {
    Ok(())
}

#[cfg(unix)]
fn set_private_file_permissions(path: &Path) -> Result<(), String> {
    use std::os::unix::fs::PermissionsExt;
    fs::set_permissions(path, fs::Permissions::from_mode(0o600)).map_err(|error| error.to_string())
}

#[cfg(not(unix))]
fn set_private_file_permissions(_path: &Path) -> Result<(), String> {
    Ok(())
}

fn validate_provider(provider_id: &str) -> Result<(), String> {
    if PROVIDERS.contains(&provider_id) {
        Ok(())
    } else {
        Err(format!("Unknown provider: {provider_id}"))
    }
}

fn allowed_credential_keys(provider_id: &str) -> &'static [&'static str] {
    PROVIDER_ENV_KEYS
        .iter()
        .find_map(|(id, keys)| (*id == provider_id).then_some(*keys))
        .unwrap_or(&[])
}

fn default_config() -> Value {
    json!({
        "baseUrls": {},
        "defaultModelId": "codex/default",
        "planMode": false
    })
}

#[tauri::command]
pub fn agent_load_config(app: AppHandle) -> Result<Value, String> {
    read_json(&rocket_dir(&app)?.join("config.json"), default_config())
}

#[tauri::command]
pub fn agent_save_config(app: AppHandle, config: Value) -> Result<(), String> {
    if !config.is_object() {
        return Err("Agent config must be an object".to_string());
    }
    write_json_private(&rocket_dir(&app)?.join("config.json"), &config)
}

#[tauri::command]
pub fn agent_save_provider_connection(
    app: AppHandle,
    provider_id: String,
    credentials: Map<String, Value>,
    base_url: Option<String>,
) -> Result<(), String> {
    validate_provider(&provider_id)?;
    let allowed_keys = allowed_credential_keys(&provider_id);
    if credentials
        .keys()
        .any(|key| !allowed_keys.contains(&key.as_str()))
    {
        return Err(format!("Unsupported credential field for {provider_id}"));
    }
    if credentials
        .values()
        .any(|value| !value.is_string() || value.as_str().is_some_and(str::is_empty))
    {
        return Err("Credential values must be non-empty strings".to_string());
    }

    let dir = rocket_dir(&app)?;
    if !credentials.is_empty() {
        let path = dir.join("credentials.json");
        let mut root = read_json(&path, json!({}))?;
        let object = root
            .as_object_mut()
            .ok_or("Credentials file must contain an object")?;
        object.insert(provider_id.clone(), Value::Object(credentials));
        write_json_private(&path, &root)?;
    }

    if let Some(base_url) = base_url.filter(|url| !url.trim().is_empty()) {
        if !base_url.starts_with("http://") && !base_url.starts_with("https://") {
            return Err("Base URL must start with http:// or https://".to_string());
        }
        let path = dir.join("config.json");
        let mut config = read_json(&path, default_config())?;
        let config_object = config
            .as_object_mut()
            .ok_or("Agent config must contain an object")?;
        let base_urls = config_object
            .entry("baseUrls")
            .or_insert_with(|| json!({}))
            .as_object_mut()
            .ok_or("baseUrls must contain an object")?;
        base_urls.insert(provider_id, Value::String(base_url));
        write_json_private(&path, &config)?;
    }
    Ok(())
}

fn codex_available() -> bool {
    Command::new("codex")
        .arg("--version")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .is_ok_and(|status| status.success())
}

#[tauri::command]
pub fn agent_provider_statuses(app: AppHandle) -> Result<Vec<ProviderStatus>, String> {
    let dir = rocket_dir(&app)?;
    let credentials = read_json(&dir.join("credentials.json"), json!({}))?;
    let saved = credentials.as_object().cloned().unwrap_or_default();
    let config = read_json(&dir.join("config.json"), default_config())?;
    let base_urls = config
        .get("baseUrls")
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default();

    Ok(PROVIDERS
        .iter()
        .map(|provider| {
            if *provider == "codex" {
                let connected = codex_available();
                return ProviderStatus {
                    provider_id: provider.to_string(),
                    connected,
                    source: connected.then_some("binary"),
                };
            }
            if matches!(*provider, "ollama" | "lm-studio") {
                return ProviderStatus {
                    provider_id: provider.to_string(),
                    connected: true,
                    source: Some("local"),
                };
            }

            let required = PROVIDER_ENV_KEYS
                .iter()
                .find_map(|(id, keys)| (*id == *provider).then_some(*keys))
                .unwrap_or(&[]);
            let saved_provider = saved.get(*provider).and_then(Value::as_object);
            let saved_connected = !required.is_empty()
                && required.iter().all(|key| {
                    saved_provider
                        .and_then(|fields| fields.get(*key))
                        .and_then(Value::as_str)
                        .is_some_and(|value| !value.trim().is_empty())
                });
            let env_connected = !required.is_empty()
                && required
                    .iter()
                    .all(|key| std::env::var(key).is_ok_and(|value| !value.trim().is_empty()));
            let custom_base_url = *provider == "openai-compatible"
                && base_urls
                    .get(*provider)
                    .and_then(Value::as_str)
                    .is_some_and(|value| !value.trim().is_empty());
            ProviderStatus {
                provider_id: provider.to_string(),
                connected: saved_connected || env_connected || custom_base_url,
                source: if saved_connected {
                    Some("credentials")
                } else if env_connected {
                    Some("environment")
                } else if custom_base_url {
                    Some("local")
                } else {
                    None
                },
            }
        })
        .collect())
}
