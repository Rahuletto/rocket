use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Read};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;
use tauri::{AppHandle, Emitter};

use crate::workspace::WorkspacePolicy;

const RESULT_LIMIT: usize = 5_000;

#[derive(Default)]
pub struct SearchManager {
    processes: Arc<Mutex<HashMap<String, Arc<Mutex<Child>>>>>,
}

impl SearchManager {
    pub fn cancel_all(&self) -> Result<(), String> {
        let mut processes = self
            .processes
            .lock()
            .map_err(|_| "Search state poisoned")?;
        for process in processes.values() {
            if let Ok(mut process) = process.lock() {
                let _ = process.kill();
            }
        }
        processes.clear();
        Ok(())
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceSearchRequest {
    id: String,
    workspace: String,
    query: String,
    include_hidden: bool,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceSearchMatch {
    id: String,
    path: String,
    line_number: usize,
    line: String,
    start: usize,
    end: usize,
}

fn parse_match(id: &str, value: &Value) -> Vec<WorkspaceSearchMatch> {
    if value.get("type").and_then(Value::as_str) != Some("match") {
        return Vec::new();
    }
    let Some(data) = value.get("data") else {
        return Vec::new();
    };
    let Some(path) = data.pointer("/path/text").and_then(Value::as_str) else {
        return Vec::new();
    };
    let Some(line_number) = data.get("line_number").and_then(Value::as_u64) else {
        return Vec::new();
    };
    let line = data
        .pointer("/lines/text")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .trim_end_matches(['\r', '\n'])
        .to_string();
    data.get("submatches")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|submatch| {
            Some(WorkspaceSearchMatch {
                id: id.to_string(),
                path: path.replace('\\', "/"),
                line_number: usize::try_from(line_number).ok()?,
                line: line.clone(),
                start: usize::try_from(submatch.get("start")?.as_u64()?).ok()?,
                end: usize::try_from(submatch.get("end")?.as_u64()?).ok()?,
            })
        })
        .collect()
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct SearchFinished {
    id: String,
    count: usize,
    limited: bool,
    error: Option<String>,
}

#[tauri::command]
pub fn search_workspace(
    app: AppHandle,
    manager: tauri::State<SearchManager>,
    policy: tauri::State<WorkspacePolicy>,
    request: WorkspaceSearchRequest,
) -> Result<(), String> {
    if request.id.trim().is_empty() {
        return Err("Search id is required".to_string());
    }
    let query = request.query.trim();
    if query.is_empty() {
        return Err("Search query is required".to_string());
    }
    if query.len() > 1_024 {
        return Err("Search query exceeds 1024 byte limit".to_string());
    }
    let (workspace, generation) =
        policy.require_root_with_generation(PathBuf::from(&request.workspace).as_path())?;
    let search_policy = policy.inner().clone();

    let mut command = Command::new("rg");
    command.args([
        "--json",
        "--line-number",
        "--column",
        "--color=never",
        "--fixed-strings",
        "--max-columns=500",
        "--max-columns-preview",
        "--glob=!.git/**",
        "--glob=!node_modules/**",
        "--glob=!target/**",
        "--glob=!dist/**",
    ]);
    if request.include_hidden {
        command.arg("--hidden");
    }
    command
        .arg("--")
        .arg(query)
        .arg(".")
        .current_dir(workspace)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let mut child = command
        .spawn()
        .map_err(|error| format!("Failed to start ripgrep: {error}"))?;
    let stdout = child.stdout.take().ok_or("ripgrep stdout unavailable")?;
    let stderr = child.stderr.take().ok_or("ripgrep stderr unavailable")?;
    let child = Arc::new(Mutex::new(child));
    let mut processes = manager
        .processes
        .lock()
        .map_err(|_| "Search state poisoned")?;
    if !search_policy.is_current(generation) {
        let _ = child.lock().map(|mut process| process.kill());
        return Err("Workspace changed while starting search".to_string());
    }
    processes.insert(request.id.clone(), Arc::clone(&child));
    drop(processes);

    let processes = Arc::clone(&manager.processes);
    let id = request.id;
    thread::spawn(move || {
        let mut count = 0;
        let mut limited = false;
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            let Ok(value) = serde_json::from_str::<Value>(&line) else {
                continue;
            };
            for search_match in parse_match(&id, &value) {
                if !search_policy.is_current(generation) {
                    if let Ok(mut process) = child.lock() {
                        let _ = process.kill();
                    }
                    break;
                }
                if count >= RESULT_LIMIT {
                    limited = true;
                    if let Ok(mut process) = child.lock() {
                        let _ = process.kill();
                    }
                    break;
                }
                count += 1;
                let _ = app.emit("workspace-search-match", search_match);
            }
            if limited {
                break;
            }
        }
        let mut stderr_text = String::new();
        let _ = BufReader::new(stderr).read_to_string(&mut stderr_text);
        let status = child
            .lock()
            .ok()
            .and_then(|mut process| process.wait().ok());
        if let Ok(mut active) = processes.lock() {
            active.remove(&id);
        }
        let error = match status.and_then(|status| status.code()) {
            Some(0 | 1) => None,
            _ if limited => None,
            _ if stderr_text.trim().is_empty() => Some("Workspace search stopped".to_string()),
            _ => Some(stderr_text.trim().to_string()),
        };
        if search_policy.is_current(generation) {
            let _ = app.emit(
                "workspace-search-finished",
                SearchFinished {
                    id,
                    count,
                    limited,
                    error,
                },
            );
        }
    });
    Ok(())
}

#[tauri::command]
pub fn cancel_workspace_search(
    manager: tauri::State<SearchManager>,
    id: String,
) -> Result<(), String> {
    let child = manager
        .processes
        .lock()
        .map_err(|_| "Search state poisoned")?
        .remove(&id);
    if let Some(child) = child {
        child
            .lock()
            .map_err(|_| "Search process state poisoned")?
            .kill()
            .map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn parses_ripgrep_json_matches_for_the_renderer() {
        let value = json!({
            "type": "match",
            "data": {
                "path": { "text": "src/example.ts" },
                "lines": { "text": "const answer = value;\n" },
                "line_number": 12,
                "submatches": [{ "match": { "text": "value" }, "start": 15, "end": 20 }]
            }
        });

        assert_eq!(
            parse_match("search-1", &value),
            vec![WorkspaceSearchMatch {
                id: "search-1".to_string(),
                path: "src/example.ts".to_string(),
                line_number: 12,
                line: "const answer = value;".to_string(),
                start: 15,
                end: 20,
            }]
        );
    }

    #[test]
    fn ignores_non_match_messages() {
        assert!(parse_match("search-1", &json!({ "type": "begin" })).is_empty());
    }
}
