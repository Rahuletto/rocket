use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use serde::Serialize;
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::Mutex;
use std::thread;
use tauri::{AppHandle, Emitter, State};

use crate::workspace::WorkspacePolicy;

struct TerminalSession {
    child: Box<dyn portable_pty::Child + Send + Sync>,
    generation: u64,
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
}

#[derive(Default)]
pub struct TerminalManager {
    sessions: Mutex<HashMap<String, TerminalSession>>,
}

impl TerminalManager {
    pub fn shutdown_all(&self) -> Result<(), String> {
        let mut sessions = self
            .sessions
            .lock()
            .map_err(|_| "Terminal state poisoned")?;
        for session in sessions.values_mut() {
            let _ = session.child.kill();
        }
        sessions.clear();
        Ok(())
    }
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct TerminalOutput {
    data: String,
    terminal_id: String,
}

#[tauri::command]
pub fn terminal_create(
    app: AppHandle,
    manager: State<TerminalManager>,
    policy: State<WorkspacePolicy>,
    terminal_id: String,
    workspace: String,
    cols: u16,
    rows: u16,
) -> Result<String, String> {
    if terminal_id.trim().is_empty() {
        return Err("Terminal ID required".to_string());
    }
    if manager
        .sessions
        .lock()
        .map_err(|_| "Terminal state poisoned")?
        .contains_key(&terminal_id)
    {
        return Err("Terminal session already exists".to_string());
    }
    let (workspace, generation) =
        policy.require_root_with_generation(std::path::Path::new(&workspace))?;
    let output_policy = policy.inner().clone();

    let pair = native_pty_system()
        .openpty(PtySize {
            cols: cols.max(2),
            rows: rows.max(1),
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|error| error.to_string())?;
    let mut command = CommandBuilder::new_default_prog();
    command.cwd(workspace);
    command.env("TERM", "xterm-256color");

    let mut child = pair
        .slave
        .spawn_command(command)
        .map_err(|error| error.to_string())?;
    let mut reader = pair
        .master
        .try_clone_reader()
        .map_err(|error| error.to_string())?;
    let writer = pair
        .master
        .take_writer()
        .map_err(|error| error.to_string())?;
    let event_id = terminal_id.clone();

    let mut sessions = manager
        .sessions
        .lock()
        .map_err(|_| "Terminal state poisoned")?;
    if !output_policy.is_current(generation) {
        let _ = child.kill();
        return Err("Workspace changed while starting the terminal".to_string());
    }
    sessions.insert(
        terminal_id.clone(),
        TerminalSession {
            child,
            generation,
            master: pair.master,
            writer,
        },
    );
    drop(sessions);

    thread::spawn(move || {
        let mut buffer = [0_u8; 8192];
        loop {
            match reader.read(&mut buffer) {
                Ok(0) | Err(_) => break,
                Ok(read) => {
                    if !output_policy.is_current(generation) {
                        break;
                    }
                    let _ = app.emit(
                        "terminal-output",
                        TerminalOutput {
                            data: String::from_utf8_lossy(&buffer[..read]).into_owned(),
                            terminal_id: event_id.clone(),
                        },
                    );
                }
            }
        }
        if output_policy.is_current(generation) {
            let _ = app.emit("terminal-exited", event_id);
        }
    });

    Ok(terminal_id)
}

#[tauri::command]
pub fn terminal_write(
    manager: State<TerminalManager>,
    policy: State<WorkspacePolicy>,
    terminal_id: String,
    data: String,
) -> Result<(), String> {
    let mut sessions = manager
        .sessions
        .lock()
        .map_err(|_| "Terminal state poisoned")?;
    let session = sessions
        .get_mut(&terminal_id)
        .ok_or("Terminal session not found")?;
    if !policy.is_current(session.generation) {
        return Err("Terminal belongs to a previous workspace".to_string());
    }
    session
        .writer
        .write_all(data.as_bytes())
        .and_then(|_| session.writer.flush())
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn terminal_resize(
    manager: State<TerminalManager>,
    policy: State<WorkspacePolicy>,
    terminal_id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let sessions = manager
        .sessions
        .lock()
        .map_err(|_| "Terminal state poisoned")?;
    let session = sessions
        .get(&terminal_id)
        .ok_or("Terminal session not found")?;
    if !policy.is_current(session.generation) {
        return Err("Terminal belongs to a previous workspace".to_string());
    }
    session
        .master
        .resize(PtySize {
            cols: cols.max(2),
            rows: rows.max(1),
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn terminal_close(manager: State<TerminalManager>, terminal_id: String) -> Result<(), String> {
    let mut session = manager
        .sessions
        .lock()
        .map_err(|_| "Terminal state poisoned")?
        .remove(&terminal_id)
        .ok_or("Terminal session not found")?;
    session.child.kill().map_err(|error| error.to_string())
}
