use super::protocol::{
    initialize_request, normalize_codex_message, skills_list_request, thread_start_request,
    turn_start_request, AgentEvent,
};
use super::references::{resolve_prompt_references, SkillEntry};
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

use crate::workspace::WorkspacePolicy;

type Pending = Arc<Mutex<HashMap<u64, Sender<Result<Value, String>>>>>;

struct ManagedChild(Child);

impl Drop for ManagedChild {
    fn drop(&mut self) {
        let _ = self.0.kill();
        let _ = self.0.wait();
    }
}

fn skill_entries_from_response(
    response: &Value,
    workspace: &str,
) -> Result<Vec<SkillEntry>, String> {
    let entries = response
        .get("data")
        .and_then(Value::as_array)
        .ok_or("Codex skills/list response missing data")?;
    let entry = entries
        .iter()
        .find(|entry| entry.get("cwd").and_then(Value::as_str) == Some(workspace))
        .or_else(|| entries.first())
        .ok_or("Codex skills/list returned no workspace entry")?;
    let mut skills = entry
        .get("skills")
        .and_then(Value::as_array)
        .ok_or("Codex skills/list workspace entry missing skills")?
        .iter()
        .filter(|skill| {
            skill
                .get("enabled")
                .and_then(Value::as_bool)
                .unwrap_or(true)
        })
        .filter_map(|skill| {
            Some(SkillEntry {
                description: skill.get("description")?.as_str()?.to_string(),
                name: skill.get("name")?.as_str()?.to_string(),
                path: skill.get("path")?.as_str()?.to_string(),
            })
        })
        .collect::<Vec<_>>();
    skills.sort_by(|left, right| left.name.cmp(&right.name));
    skills.dedup_by(|left, right| left.name == right.name && left.path == right.path);
    Ok(skills)
}

fn build_turn_request(
    id: u64,
    thread_id: &str,
    prompt: &str,
    reference_text: &str,
    workspace: &Path,
    skills: &[SkillEntry],
) -> Result<Value, String> {
    let references = resolve_prompt_references(workspace, reference_text, skills)?;
    Ok(turn_start_request(id, thread_id, prompt, &references))
}

pub fn discover_skills(workspace: &str) -> Result<Vec<SkillEntry>, String> {
    let child = Command::new("codex")
        .args(["app-server", "--stdio"])
        .current_dir(workspace)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|error| format!("Failed to start Codex skill discovery: {error}"))?;
    let mut child = ManagedChild(child);
    let mut stdin = child
        .0
        .stdin
        .take()
        .ok_or("Codex skill discovery stdin unavailable")?;
    let stdout = child
        .0
        .stdout
        .take()
        .ok_or("Codex skill discovery stdout unavailable")?;

    for request in [
        initialize_request(1),
        skills_list_request(2, workspace, true),
    ] {
        serde_json::to_writer(&mut stdin, &request).map_err(|error| error.to_string())?;
        stdin.write_all(b"\n").map_err(|error| error.to_string())?;
    }
    stdin.flush().map_err(|error| error.to_string())?;

    let (sender, receiver) = channel();
    thread::spawn(move || {
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            let Ok(value) = serde_json::from_str::<Value>(&line) else {
                continue;
            };
            if value.get("id").and_then(Value::as_u64) != Some(2) {
                continue;
            }
            let result = if let Some(error) = value.get("error") {
                Err(format!("Codex skills/list failed: {error}"))
            } else {
                Ok(value.get("result").cloned().unwrap_or(Value::Null))
            };
            let _ = sender.send(result);
            break;
        }
    });

    let response = receiver
        .recv_timeout(Duration::from_secs(30))
        .map_err(|_| "Codex skills/list timed out".to_string())?;
    skill_entries_from_response(&response?, workspace)
}

pub struct CodexProcess {
    child: Child,
    stdin: Arc<Mutex<ChildStdin>>,
    pending: Pending,
    next_id: AtomicU64,
    thread_id: String,
    workspace: PathBuf,
}

impl CodexProcess {
    pub fn start(
        app: AppHandle,
        workspace: &str,
        model: Option<&str>,
        session_id: &str,
        policy: WorkspacePolicy,
        generation: u64,
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
        let reader_policy = policy.clone();
        thread::spawn(move || {
            for line in BufReader::new(stdout).lines() {
                if !reader_policy.is_current(generation) {
                    for (_, sender) in reader_pending.lock().unwrap().drain() {
                        let _ = sender.send(Err("Workspace changed".to_string()));
                    }
                    break;
                }
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
            if reader_policy.is_current(generation) {
                let _ = reader_app.emit("agent-event", tag_event(&stopped, &reader_session_id));
            }
        });

        let stderr_app = app;
        let stderr_policy = policy;
        thread::spawn(move || {
            for line in BufReader::new(stderr).lines().flatten() {
                if !stderr_policy.is_current(generation) {
                    break;
                }
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
            workspace: PathBuf::from(workspace),
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

    pub fn send(&self, prompt: &str, reference_text: &str) -> Result<String, String> {
        let skills = if reference_text
            .split_whitespace()
            .any(|word| word.starts_with('#'))
        {
            let result = self.request(skills_list_request(
                self.next_request_id(),
                &self.workspace.to_string_lossy(),
                false,
            ))?;
            skill_entries_from_response(&result, &self.workspace.to_string_lossy())?
        } else {
            Vec::new()
        };
        let request = build_turn_request(
            self.next_request_id(),
            &self.thread_id,
            prompt,
            reference_text,
            &self.workspace,
            &skills,
        )?;
        let result = self.request(request)?;
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
        obj.insert(
            "sessionId".to_string(),
            Value::String(session_id.to_string()),
        );
    }
    json
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn parses_enabled_skills_for_requested_workspace() {
        let response = json!({
            "data": [{
                "cwd": "/workspace",
                "skills": [
                    {
                        "name": "review",
                        "description": "Review code",
                        "path": "/skills/review/SKILL.md",
                        "scope": "user",
                        "enabled": true
                    },
                    {
                        "name": "disabled",
                        "description": "Disabled skill",
                        "path": "/skills/disabled/SKILL.md",
                        "scope": "user",
                        "enabled": false
                    }
                ],
                "errors": []
            }]
        });

        let skills = skill_entries_from_response(&response, "/workspace").unwrap();

        assert_eq!(skills.len(), 1);
        assert_eq!(skills[0].name, "review");
        assert_eq!(skills[0].description, "Review code");
        assert_eq!(skills[0].path, "/skills/review/SKILL.md");
    }

    #[test]
    fn builds_turn_references_from_original_user_text_only() {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let workspace =
            std::env::temp_dir().join(format!("rocket-codex-turn-{}-{nonce}", std::process::id()));
        fs::create_dir_all(workspace.join("src")).unwrap();
        fs::write(workspace.join("src/App.tsx"), "export default App;\n").unwrap();

        let request = build_turn_request(
            9,
            "thread-1",
            "<rocket_editor_context>@not-a-reference</rocket_editor_context>\n<user_request>Open @src/App.tsx</user_request>",
            "Open @src/App.tsx",
            &workspace,
            &[],
        )
        .unwrap();

        assert_eq!(request["params"]["input"].as_array().unwrap().len(), 2);
        assert_eq!(request["params"]["input"][1]["name"], "src/App.tsx");
        fs::remove_dir_all(workspace).unwrap();
    }
}
