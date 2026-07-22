use serde::Serialize;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::mpsc::{channel, Sender};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use url::Url;

type Pending = Arc<Mutex<HashMap<u64, Sender<Result<Value, String>>>>>;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LspStatus {
    language: &'static str,
    state: &'static str,
    command: String,
    message: String,
    capabilities: Option<Value>,
}

pub struct LspManager {
    process: Mutex<Option<LspProcess>>,
}

impl Default for LspManager {
    fn default() -> Self {
        Self {
            process: Mutex::new(None),
        }
    }
}

struct LspProcess {
    child: Child,
    command: String,
    root: PathBuf,
    stdin: Arc<Mutex<ChildStdin>>,
    pending: Pending,
    next_id: AtomicU64,
    capabilities: Value,
}

fn encode_message(value: &Value) -> Vec<u8> {
    let body = serde_json::to_vec(value).expect("JSON-RPC values serialize");
    let mut framed = format!("Content-Length: {}\r\n\r\n", body.len()).into_bytes();
    framed.extend(body);
    framed
}

fn read_message(reader: &mut impl BufRead) -> Result<Option<Value>, String> {
    let mut content_length = None;
    loop {
        let mut header = String::new();
        let count = reader
            .read_line(&mut header)
            .map_err(|error| error.to_string())?;
        if count == 0 {
            return Ok(None);
        }
        let header = header.trim_end_matches(['\r', '\n']);
        if header.is_empty() {
            break;
        }
        if let Some(value) = header.strip_prefix("Content-Length:") {
            content_length = Some(
                value
                    .trim()
                    .parse::<usize>()
                    .map_err(|_| "Invalid LSP Content-Length".to_string())?,
            );
        }
    }
    let length = content_length.ok_or("LSP message missing Content-Length")?;
    if length > 16 * 1024 * 1024 {
        return Err("LSP message exceeds 16 MiB limit".to_string());
    }
    let mut body = vec![0; length];
    reader
        .read_exact(&mut body)
        .map_err(|error| error.to_string())?;
    serde_json::from_slice(&body)
        .map(Some)
        .map_err(|error| format!("Invalid LSP JSON: {error}"))
}

fn canonicalize_confined(root: &Path, candidate: &Path) -> Result<PathBuf, String> {
    let canonical_root = root
        .canonicalize()
        .map_err(|error| format!("Invalid LSP workspace: {error}"))?;
    let canonical_candidate = candidate
        .canonicalize()
        .map_err(|error| format!("Invalid document path: {error}"))?;
    if !canonical_candidate.starts_with(&canonical_root) {
        return Err("LSP document is outside the open workspace".to_string());
    }
    Ok(canonical_candidate)
}

fn document_uri(root: &Path, path: &Path) -> Result<String, String> {
    let path = canonicalize_confined(root, path)?;
    Url::from_file_path(path)
        .map(|url| url.to_string())
        .map_err(|_| "Unable to create file URI".to_string())
}

fn notification_is_confined(root: &Path, params: &Value) -> bool {
    let Some(uri) = params.get("uri").and_then(Value::as_str) else {
        return false;
    };
    let Ok(url) = Url::parse(uri) else {
        return false;
    };
    let Ok(path) = url.to_file_path() else {
        return false;
    };
    canonicalize_confined(root, &path).is_ok()
}

fn language_server_command(root: &Path) -> (PathBuf, String) {
    let workspace_binary = root
        .join("node_modules")
        .join(".bin")
        .join("typescript-language-server");
    if workspace_binary.is_file() {
        return (
            workspace_binary.clone(),
            workspace_binary.display().to_string(),
        );
    }
    if let Ok(current) = std::env::current_dir() {
        let bundled = current
            .join("node_modules")
            .join(".bin")
            .join("typescript-language-server");
        if bundled.is_file() {
            return (bundled.clone(), bundled.display().to_string());
        }
    }
    (
        PathBuf::from("typescript-language-server"),
        "typescript-language-server".to_string(),
    )
}

fn emit_status(app: &AppHandle, status: &LspStatus) {
    let _ = app.emit("lsp-status", status);
}

impl LspProcess {
    fn start(app: AppHandle, root: &Path) -> Result<Self, String> {
        let root = root
            .canonicalize()
            .map_err(|error| format!("Invalid LSP workspace: {error}"))?;
        if !root.is_dir() {
            return Err("LSP workspace is not a directory".to_string());
        }
        let (executable, command_label) = language_server_command(&root);
        let allowed_environment: Vec<(String, String)> = [
            "PATH",
            "HOME",
            "TMPDIR",
            "TMP",
            "TEMP",
            "SystemRoot",
            "WINDIR",
            "PATHEXT",
        ]
        .into_iter()
        .filter_map(|name| {
            std::env::var(name)
                .ok()
                .map(|value| (name.to_string(), value))
        })
        .collect();
        let mut command = Command::new(&executable);
        command
            .arg("--stdio")
            .current_dir(&root)
            .env_clear()
            .envs(allowed_environment)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        let mut child = command.spawn().map_err(|error| {
            format!(
                "Failed to start {command_label}: {error}. Install typescript-language-server or add it to the workspace."
            )
        })?;
        let stdin = Arc::new(Mutex::new(
            child
                .stdin
                .take()
                .ok_or("Language server stdin unavailable")?,
        ));
        let stdout = child
            .stdout
            .take()
            .ok_or("Language server stdout unavailable")?;
        let stderr = child
            .stderr
            .take()
            .ok_or("Language server stderr unavailable")?;
        let pending: Pending = Arc::new(Mutex::new(HashMap::new()));

        let reader_pending = Arc::clone(&pending);
        let reader_app = app.clone();
        let reader_root = root.clone();
        thread::spawn(move || {
            let mut reader = BufReader::new(stdout);
            loop {
                match read_message(&mut reader) {
                    Ok(Some(value)) => {
                        if let Some(id) = value.get("id").and_then(Value::as_u64) {
                            if let Some(sender) = reader_pending.lock().unwrap().remove(&id) {
                                let result = if let Some(error) = value.get("error") {
                                    Err(error.to_string())
                                } else {
                                    Ok(value.get("result").cloned().unwrap_or(Value::Null))
                                };
                                let _ = sender.send(result);
                            }
                            continue;
                        }
                        if value.get("method").and_then(Value::as_str)
                            == Some("textDocument/publishDiagnostics")
                        {
                            if let Some(params) = value.get("params") {
                                if notification_is_confined(&reader_root, params) {
                                    let _ = reader_app.emit("lsp-diagnostics", params.clone());
                                } else {
                                    let _ = reader_app.emit(
                                        "lsp-log",
                                        "Ignored diagnostics outside the open workspace",
                                    );
                                }
                            }
                        }
                    }
                    Ok(None) => break,
                    Err(error) => {
                        let _ = reader_app.emit("lsp-log", error);
                        break;
                    }
                }
            }
            let _ = reader_app.emit(
                "lsp-status",
                LspStatus {
                    language: "typescript-javascript",
                    state: "stopped",
                    command: command_label,
                    message: "Language server stopped".to_string(),
                    capabilities: None,
                },
            );
        });

        let stderr_app = app;
        thread::spawn(move || {
            for line in BufReader::new(stderr).lines().map_while(Result::ok) {
                if !line.trim().is_empty() {
                    let _ = stderr_app.emit("lsp-log", line);
                }
            }
        });

        let mut process = Self {
            child,
            command: executable.display().to_string(),
            root,
            stdin,
            pending,
            next_id: AtomicU64::new(1),
            capabilities: Value::Null,
        };
        let root_uri = Url::from_directory_path(&process.root)
            .map_err(|_| "Unable to create workspace URI".to_string())?
            .to_string();
        let initialize = process.request(
            "initialize",
            json!({
                "processId": Value::Null,
                "rootUri": root_uri,
                "capabilities": {
                    "textDocument": {
                        "completion": { "completionItem": { "snippetSupport": true } },
                        "publishDiagnostics": { "relatedInformation": true }
                    },
                    "workspace": { "workspaceFolders": true, "symbol": {} }
                },
                "workspaceFolders": [{ "name": process.root.file_name().and_then(|name| name.to_str()).unwrap_or("workspace"), "uri": root_uri }],
                "clientInfo": { "name": "Rocket", "version": env!("CARGO_PKG_VERSION") }
            }),
        )?;
        process.capabilities = initialize
            .get("capabilities")
            .cloned()
            .unwrap_or(Value::Null);
        process.notify("initialized", json!({}))?;
        Ok(process)
    }

    fn write(&self, value: &Value) -> Result<(), String> {
        let framed = encode_message(value);
        let mut stdin = self.stdin.lock().map_err(|_| "LSP stdin poisoned")?;
        stdin
            .write_all(&framed)
            .map_err(|error| error.to_string())?;
        stdin.flush().map_err(|error| error.to_string())
    }

    fn notify(&self, method: &str, params: Value) -> Result<(), String> {
        self.write(&json!({ "jsonrpc": "2.0", "method": method, "params": params }))
    }

    fn request(&self, method: &str, params: Value) -> Result<Value, String> {
        let id = self.next_id.fetch_add(1, Ordering::Relaxed);
        let (sender, receiver) = channel();
        self.pending
            .lock()
            .map_err(|_| "LSP request state poisoned")?
            .insert(id, sender);
        if let Err(error) =
            self.write(&json!({ "jsonrpc": "2.0", "id": id, "method": method, "params": params }))
        {
            self.pending.lock().unwrap().remove(&id);
            return Err(error);
        }
        receiver
            .recv_timeout(Duration::from_secs(20))
            .map_err(|_| format!("LSP request timed out: {method}"))?
    }

    fn status(&self) -> LspStatus {
        LspStatus {
            language: "typescript-javascript",
            state: "running",
            command: self.command.clone(),
            message: "TypeScript language server running".to_string(),
            capabilities: Some(self.capabilities.clone()),
        }
    }

    fn shutdown(&mut self) {
        let _ = self.request("shutdown", Value::Null);
        let _ = self.notify("exit", Value::Null);
    }
}

impl Drop for LspProcess {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

fn start_process(
    app: AppHandle,
    manager: tauri::State<LspManager>,
    root_path: String,
) -> Result<LspStatus, String> {
    let root = PathBuf::from(root_path);
    let starting = LspStatus {
        language: "typescript-javascript",
        state: "starting",
        command: "typescript-language-server --stdio".to_string(),
        message: "Starting TypeScript language server".to_string(),
        capabilities: None,
    };
    emit_status(&app, &starting);
    let process = LspProcess::start(app.clone(), &root)?;
    let status = process.status();
    let mut active = manager.process.lock().map_err(|_| "LSP state poisoned")?;
    if let Some(mut previous) = active.take() {
        previous.shutdown();
    }
    *active = Some(process);
    emit_status(&app, &status);
    Ok(status)
}

#[tauri::command]
pub fn lsp_start(
    app: AppHandle,
    manager: tauri::State<LspManager>,
    root_path: String,
) -> Result<LspStatus, String> {
    start_process(app, manager, root_path)
}

#[tauri::command]
pub fn lsp_restart(
    app: AppHandle,
    manager: tauri::State<LspManager>,
    root_path: String,
) -> Result<LspStatus, String> {
    {
        let mut active = manager.process.lock().map_err(|_| "LSP state poisoned")?;
        if let Some(mut process) = active.take() {
            process.shutdown();
        }
    }
    start_process(app, manager, root_path)
}

#[tauri::command]
pub fn lsp_stop(manager: tauri::State<LspManager>) -> Result<(), String> {
    let mut active = manager.process.lock().map_err(|_| "LSP state poisoned")?;
    if let Some(mut process) = active.take() {
        process.shutdown();
    }
    Ok(())
}

#[tauri::command]
pub fn lsp_request(
    manager: tauri::State<LspManager>,
    method: String,
    params: Value,
) -> Result<Value, String> {
    let active = manager.process.lock().map_err(|_| "LSP state poisoned")?;
    active
        .as_ref()
        .ok_or("Language server is not running".to_string())?
        .request(&method, params)
}

#[tauri::command]
pub fn lsp_document_event(
    manager: tauri::State<LspManager>,
    kind: String,
    path: String,
    language_id: Option<String>,
    version: Option<i64>,
    text: Option<String>,
) -> Result<(), String> {
    let active = manager.process.lock().map_err(|_| "LSP state poisoned")?;
    let process = active
        .as_ref()
        .ok_or("Language server is not running".to_string())?;
    let uri = document_uri(&process.root, Path::new(&path))?;
    match kind.as_str() {
        "Open" => process.notify(
            "textDocument/didOpen",
            json!({
                "textDocument": {
                    "uri": uri,
                    "languageId": language_id.unwrap_or_else(|| "typescript".to_string()),
                    "version": version.unwrap_or(1),
                    "text": text.unwrap_or_default()
                }
            }),
        ),
        "Change" => process.notify(
            "textDocument/didChange",
            json!({
                "textDocument": { "uri": uri, "version": version.unwrap_or(1) },
                "contentChanges": [{ "text": text.unwrap_or_default() }]
            }),
        ),
        "Save" => process.notify(
            "textDocument/didSave",
            json!({ "textDocument": { "uri": uri }, "text": text }),
        ),
        "Close" => process.notify(
            "textDocument/didClose",
            json!({ "textDocument": { "uri": uri } }),
        ),
        _ => Err(format!("Unknown LSP document event: {kind}")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn frames_json_rpc_messages_for_language_servers() {
        let body = serde_json::to_vec(&json!({"jsonrpc": "2.0", "method": "initialized"})).unwrap();
        let framed = encode_message(&json!({"jsonrpc": "2.0", "method": "initialized"}));
        let expected_prefix = format!("Content-Length: {}\r\n\r\n", body.len());

        assert!(framed.starts_with(expected_prefix.as_bytes()));
        assert_eq!(&framed[expected_prefix.len()..], body);
    }

    #[test]
    fn rejects_paths_outside_the_lsp_workspace() {
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .canonicalize()
            .unwrap();
        let inside = canonicalize_confined(&root, &root.join("src")).unwrap();
        let outside = canonicalize_confined(&root, root.parent().unwrap());

        assert!(inside.starts_with(&root));
        assert!(outside.is_err());
    }
}
