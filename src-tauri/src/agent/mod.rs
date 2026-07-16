mod codex;
mod protocol;
pub(crate) mod storage;

use codex::CodexProcess;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::AppHandle;

#[derive(Default)]
pub struct AgentManager {
    process: Mutex<Option<CodexProcess>>,
}

const SKIP_DIRS: &[&str] = &[
    "node_modules",
    ".git",
    "dist",
    "target",
    ".next",
    "__pycache__",
    ".cache",
    ".turbo",
    "coverage",
    ".venv",
    "venv",
];
const MAX_COMPLETION_FILES: usize = 20_000;

fn is_code_file(name: &str) -> bool {
    Path::new(name)
        .extension()
        .and_then(|ext| ext.to_str())
        .is_some_and(|ext| {
            matches!(
                ext.to_ascii_lowercase().as_str(),
                "ts" | "tsx"
                    | "js"
                    | "jsx"
                    | "json"
                    | "md"
                    | "py"
                    | "go"
                    | "rs"
                    | "css"
                    | "html"
                    | "yaml"
                    | "yml"
                    | "toml"
                    | "sh"
                    | "sql"
                    | "vue"
                    | "svelte"
                    | "c"
                    | "cpp"
                    | "h"
                    | "java"
                    | "kt"
                    | "swift"
            )
        })
}

fn walk_files(dir: &Path, rel: &str, depth: u32, max_depth: u32, out: &mut Vec<String>) {
    if depth > max_depth || out.len() >= MAX_COMPLETION_FILES {
        return;
    }
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        if out.len() >= MAX_COMPLETION_FILES {
            break;
        }
        let name = entry.file_name().to_string_lossy().into_owned();
        if name.starts_with('.') && name != ".agents" {
            continue;
        }
        if SKIP_DIRS.contains(&name.as_str()) {
            continue;
        }
        let entry_rel = if rel.is_empty() {
            name.clone()
        } else {
            format!("{rel}/{name}")
        };
        let path = entry.path();
        if path.is_dir() {
            walk_files(&path, &entry_rel, depth + 1, max_depth, out);
        } else if is_code_file(&name) {
            out.push(entry_rel);
        }
    }
}

#[tauri::command]
pub fn agent_list_files(
    folder_path: String,
    max_depth: Option<u32>,
) -> Result<Vec<String>, String> {
    let root = PathBuf::from(&folder_path);
    if !root.is_dir() {
        return Err(format!("Not a directory: {folder_path}"));
    }
    let mut out = Vec::new();
    walk_files(&root, "", 0, max_depth.unwrap_or(6).min(12), &mut out);
    out.sort();
    Ok(out)
}

#[tauri::command]
pub fn agent_list_skills(folder_path: String) -> Result<Vec<String>, String> {
    let mut skills = Vec::new();
    let candidates = [
        PathBuf::from(&folder_path).join(".agents").join("skills"),
        PathBuf::from(&folder_path)
            .join("..")
            .join(".agents")
            .join("skills"),
    ];
    for dir in candidates {
        let Ok(entries) = fs::read_dir(&dir) else {
            continue;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() && path.join("SKILL.md").is_file() {
                if let Some(name) = entry.file_name().to_str() {
                    skills.push(name.to_string());
                }
            }
        }
    }
    skills.sort();
    skills.dedup();
    Ok(skills)
}

#[tauri::command]
pub fn agent_start_session(
    app: AppHandle,
    manager: tauri::State<AgentManager>,
    workspace: String,
    model: Option<String>,
) -> Result<String, String> {
    let process = CodexProcess::start(app, &workspace, model.as_deref())?;
    let thread_id = process.thread_id().to_string();
    *manager.process.lock().map_err(|_| "Agent state poisoned")? = Some(process);
    Ok(thread_id)
}

#[tauri::command]
pub fn agent_send(manager: tauri::State<AgentManager>, prompt: String) -> Result<String, String> {
    let process = manager.process.lock().map_err(|_| "Agent state poisoned")?;
    process
        .as_ref()
        .ok_or_else(|| "No active agent session".to_string())?
        .send(&prompt)
}

#[tauri::command]
pub fn agent_interrupt(manager: tauri::State<AgentManager>, turn_id: String) -> Result<(), String> {
    let process = manager.process.lock().map_err(|_| "Agent state poisoned")?;
    process
        .as_ref()
        .ok_or_else(|| "No active agent session".to_string())?
        .interrupt(&turn_id)
}

#[tauri::command]
pub fn agent_respond_approval(
    manager: tauri::State<AgentManager>,
    request_id: String,
    decision: String,
) -> Result<(), String> {
    let process = manager.process.lock().map_err(|_| "Agent state poisoned")?;
    process
        .as_ref()
        .ok_or_else(|| "No active agent session".to_string())?
        .respond_approval(&request_id, &decision)
}
