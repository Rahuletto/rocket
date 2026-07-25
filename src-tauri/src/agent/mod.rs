mod codex;
pub(crate) mod profiles;
mod protocol;
mod references;
pub(crate) mod storage;

use codex::{discover_skills, CodexProcess};
use references::SkillEntry;
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::AppHandle;

use crate::workspace::WorkspacePolicy;

#[derive(Default)]
pub struct AgentManager {
    sessions: Mutex<HashMap<String, AgentSession>>,
}

struct AgentSession {
    generation: u64,
    process: CodexProcess,
}

impl AgentManager {
    pub fn shutdown_all(&self) -> Result<(), String> {
        self.sessions
            .lock()
            .map_err(|_| "Agent state poisoned")?
            .clear();
        Ok(())
    }
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
        let Ok(file_type) = entry.file_type() else {
            continue;
        };
        if file_type.is_symlink() {
            continue;
        }
        if file_type.is_dir() {
            walk_files(&path, &entry_rel, depth + 1, max_depth, out);
        } else if is_code_file(&name) {
            out.push(entry_rel);
        }
    }
}

#[tauri::command]
pub fn agent_list_files(
    policy: tauri::State<WorkspacePolicy>,
    folder_path: String,
    max_depth: Option<u32>,
) -> Result<Vec<String>, String> {
    let (root, generation) =
        policy.require_root_with_generation(PathBuf::from(&folder_path).as_path())?;
    let mut out = Vec::new();
    walk_files(&root, "", 0, max_depth.unwrap_or(6).min(12), &mut out);
    if !policy.is_current(generation) {
        return Err("Workspace changed during file discovery".to_string());
    }
    out.sort();
    Ok(out)
}

#[tauri::command]
pub async fn agent_list_skills(
    policy: tauri::State<'_, WorkspacePolicy>,
    folder_path: String,
) -> Result<Vec<SkillEntry>, String> {
    let (folder_path, generation) =
        policy.require_root_with_generation(PathBuf::from(&folder_path).as_path())?;
    let folder_path = folder_path.to_string_lossy().into_owned();
    let skills = tauri::async_runtime::spawn_blocking(move || discover_skills(&folder_path))
        .await
        .map_err(|error| format!("Codex skill discovery task failed: {error}"))??;
    if !policy.is_current(generation) {
        return Err("Workspace changed during skill discovery".to_string());
    }
    Ok(skills)
}

#[tauri::command]
pub fn agent_start_session(
    app: AppHandle,
    manager: tauri::State<AgentManager>,
    policy: tauri::State<WorkspacePolicy>,
    workspace: String,
    model: Option<String>,
    session_id: String,
) -> Result<String, String> {
    let (workspace, generation) =
        policy.require_root_with_generation(PathBuf::from(&workspace).as_path())?;
    let workspace = workspace.to_string_lossy().into_owned();
    let mut sessions = manager.sessions.lock().map_err(|_| "Agent state poisoned")?;
    // Replace any existing session for this tab.
    if let Some(old) = sessions.remove(&session_id) {
        drop(old);
    }
    let process = CodexProcess::start(
        app,
        &workspace,
        model.as_deref(),
        &session_id,
        policy.inner().clone(),
        generation,
    )?;
    if !policy.is_current(generation) {
        drop(process);
        return Err("Workspace changed while starting the agent".to_string());
    }
    let thread_id = process.thread_id().to_string();
    sessions.insert(
        session_id,
        AgentSession {
            generation,
            process,
        },
    );
    Ok(thread_id)
}

#[tauri::command]
pub fn agent_send(
    manager: tauri::State<AgentManager>,
    policy: tauri::State<WorkspacePolicy>,
    session_id: String,
    prompt: String,
    reference_text: Option<String>,
) -> Result<String, String> {
    let mut sessions = manager.sessions.lock().map_err(|_| "Agent state poisoned")?;
    let session = sessions
        .get_mut(&session_id)
        .ok_or_else(|| format!("No agent session for {session_id}"))?;
    if !policy.is_current(session.generation) {
        return Err("Agent session belongs to a previous workspace".to_string());
    }
    session.process.send(&prompt, reference_text.as_deref().unwrap_or(&prompt))
}

#[tauri::command]
pub fn agent_interrupt(
    manager: tauri::State<AgentManager>,
    policy: tauri::State<WorkspacePolicy>,
    session_id: String,
    turn_id: String,
) -> Result<(), String> {
    let mut sessions = manager.sessions.lock().map_err(|_| "Agent state poisoned")?;
    let session = sessions
        .get_mut(&session_id)
        .ok_or_else(|| format!("No agent session for {session_id}"))?;
    if !policy.is_current(session.generation) {
        return Err("Agent session belongs to a previous workspace".to_string());
    }
    session.process.interrupt(&turn_id)
}

#[tauri::command]
pub fn agent_respond_approval(
    manager: tauri::State<AgentManager>,
    policy: tauri::State<WorkspacePolicy>,
    session_id: String,
    request_id: String,
    decision: String,
) -> Result<(), String> {
    let mut sessions = manager.sessions.lock().map_err(|_| "Agent state poisoned")?;
    let session = sessions
        .get_mut(&session_id)
        .ok_or_else(|| format!("No agent session for {session_id}"))?;
    if !policy.is_current(session.generation) {
        return Err("Agent session belongs to a previous workspace".to_string());
    }
    session.process.respond_approval(&request_id, &decision)
}

#[tauri::command]
pub fn agent_end_session(
    manager: tauri::State<AgentManager>,
    session_id: String,
) -> Result<(), String> {
    let mut sessions = manager.sessions.lock().map_err(|_| "Agent state poisoned")?;
    if let Some(process) = sessions.remove(&session_id) {
        drop(process); // kills the child via Drop
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[cfg(unix)]
    #[test]
    fn file_discovery_does_not_follow_directory_symlinks() {
        use std::os::unix::fs::symlink;

        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!("rocket-agent-files-{suffix}"));
        let outside = std::env::temp_dir().join(format!("rocket-agent-outside-{suffix}"));
        fs::create_dir_all(&root).unwrap();
        fs::create_dir_all(&outside).unwrap();
        fs::write(root.join("main.rs"), "fn main() {}").unwrap();
        fs::write(outside.join("secret.rs"), "secret").unwrap();
        symlink(&outside, root.join("escaped")).unwrap();
        let mut files = Vec::new();

        walk_files(&root, "", 0, 6, &mut files);

        assert_eq!(files, vec!["main.rs"]);
        fs::remove_dir_all(root).unwrap();
        fs::remove_dir_all(outside).unwrap();
    }
}
