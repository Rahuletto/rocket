mod codex;
mod protocol;

use codex::CodexProcess;
use std::sync::Mutex;
use tauri::AppHandle;

#[derive(Default)]
pub struct AgentManager {
    process: Mutex<Option<CodexProcess>>,
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
