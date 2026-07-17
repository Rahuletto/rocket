use super::protocol::{
    initialize_request, normalize_codex_message, thread_start_request, turn_start_request,
    AgentEvent,
};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::mpsc::{channel, Sender};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

type Pending = Arc<Mutex<HashMap<u64, Sender<Result<Value, String>>>>>;

pub struct CodexProcess {
    child: Child,
    stdin: Arc<Mutex<ChildStdin>>,
    pending: Pending,
    next_id: AtomicU64,
    thread_id: String,
}

impl CodexProcess {
    pub fn start(
        app: AppHandle,
        workspace: &str,
        model: Option<&str>,
        session_id: &str,
    ) -> Result<Self, String> {
        let mut child = Command::new("codex")
            .args(["app-server", "--stdio"])
            .current_dir(workspace)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|error| format!("Failed to start Codex: {error}"))?;

        let stdin = Arc::new(Mutex::new(
            child.stdin.take().ok_or("Codex stdin unavailable")?,
        ));
        let stdout = child.stdout.take().ok_or("Codex stdout unavailable")?;
        let stderr = child.stderr.take().ok_or("Codex stderr unavailable")?;
        let pending: Pending = Arc::new(Mutex::new(HashMap::new()));

        let reader_pending = Arc::clone(&pending);
        let reader_app = app.clone();
        let reader_session_id = session_id.to_string();
        thread::spawn(move || {
            for line in BufReader::new(stdout).lines() {
                let Ok(line) = line else { break };
                let Ok(value) = serde_json::from_str::<Value>(&line) else {
                    continue;
                };
                if value.get("method").is_none() {
                    if let Some(id) = value.get("id").and_then(Value::as_u64) {
                        if let Some(sender) = reader_pending.lock().unwrap().remove(&id) {
                            let result = if let Some(error) = value.get("error") {
                                Err(error.to_string())
                            } else {
                                Ok(value.get("result").cloned().unwrap_or(Value::Null))
                            };
                            let _ = sender.send(result);
                        }
                    }
                    continue;
                }
                for event in normalize_codex_message(&value) {
                    let _ = reader_app.emit("agent-event", tag_event(&event, &reader_session_id));
                }
            }
            let stopped = AgentEvent::Error {
                message: "Codex app-server stopped".to_string(),
            };
            let _ = reader_app.emit("agent-event", tag_event(&stopped, &reader_session_id));
        });

        let stderr_app = app;
        thread::spawn(move || {
            for line in BufReader::new(stderr).lines().flatten() {
                if !line.trim().is_empty() {
                    let _ = stderr_app.emit("agent-log", line);
                }
            }
        });

        let mut process = Self {
            child,
            stdin,
            pending,
            next_id: AtomicU64::new(1),
            thread_id: String::new(),
        };
        process.request(initialize_request(process.next_request_id()))?;
        process.notify(json!({ "method": "initialized", "params": {} }))?;
        let result = process.request(thread_start_request(
            process.next_request_id(),
            workspace,
            model,
        ))?;
        process.thread_id = result
            .pointer("/thread/id")
            .and_then(Value::as_str)
            .ok_or("Codex did not return a thread id")?
            .to_string();

        Ok(process)
    }

    fn next_request_id(&self) -> u64 {
        self.next_id.fetch_add(1, Ordering::Relaxed)
    }

    fn write_message(&self, message: &Value) -> Result<(), String> {
        let mut stdin = self.stdin.lock().map_err(|_| "Codex stdin poisoned")?;
        serde_json::to_writer(&mut *stdin, message).map_err(|error| error.to_string())?;
        stdin.write_all(b"\n").map_err(|error| error.to_string())?;
        stdin.flush().map_err(|error| error.to_string())
    }

    fn notify(&self, message: Value) -> Result<(), String> {
        self.write_message(&message)
    }

    fn request(&self, message: Value) -> Result<Value, String> {
        let id = message
            .get("id")
            .and_then(Value::as_u64)
            .ok_or("Request id missing")?;
        let (sender, receiver) = channel();
        self.pending.lock().unwrap().insert(id, sender);
        self.write_message(&message)?;
        receiver
            .recv_timeout(Duration::from_secs(30))
            .map_err(|_| "Codex request timed out".to_string())?
    }

    pub fn send(&self, prompt: &str) -> Result<String, String> {
        let result = self.request(turn_start_request(
            self.next_request_id(),
            &self.thread_id,
            prompt,
        ))?;
        result
            .pointer("/turn/id")
            .and_then(Value::as_str)
            .map(str::to_string)
            .ok_or_else(|| "Codex did not return a turn id".to_string())
    }

    pub fn interrupt(&self, turn_id: &str) -> Result<(), String> {
        self.request(json!({
            "id": self.next_request_id(),
            "method": "turn/interrupt",
            "params": {
                "threadId": self.thread_id,
                "turnId": turn_id
            }
        }))?;
        Ok(())
    }

    pub fn respond_approval(&self, request_id: &str, decision: &str) -> Result<(), String> {
        let id = serde_json::from_str::<Value>(request_id)
            .unwrap_or_else(|_| Value::String(request_id.to_string()));
        self.write_message(&json!({
            "id": id,
            "result": { "decision": decision }
        }))
    }

    pub fn thread_id(&self) -> &str {
        &self.thread_id
    }
}

impl Drop for CodexProcess {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

/// Inject the session id into an event so the frontend can route by tab.
fn tag_event(event: &AgentEvent, session_id: &str) -> Value {
    let mut json = serde_json::to_value(event).unwrap_or_else(|_| Value::Null);
    if let Some(obj) = json.as_object_mut() {
        obj.insert("sessionId".to_string(), Value::String(session_id.to_string()));
    }
    json
}
