use notify::{Config, RecommendedWatcher, RecursiveMode, Watcher};
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::Duration;
use tauri::{
    window::{Effect, EffectState, EffectsBuilder},
    AppHandle, Emitter, Manager,
};

mod agent;
mod fs;
mod git;
mod lsp;
mod menu;
mod search;
mod terminal;
mod workspace;

#[derive(Default)]
struct WatcherState(Mutex<Option<RecommendedWatcher>>);

#[tauri::command]
fn open(
    folder_path: &str,
    workspace: tauri::State<workspace::WorkspacePolicy>,
) -> Result<Vec<fs::FileStruct>, String> {
    let path = workspace.existing_path(PathBuf::from(folder_path).as_path())?;
    fs::read_directory(path.to_str().ok_or("Workspace path is not valid UTF-8")?)
}

#[tauri::command]
fn get_contents(
    dir_path: &str,
    workspace: tauri::State<workspace::WorkspacePolicy>,
) -> Result<String, String> {
    let path = workspace.existing_path(PathBuf::from(dir_path).as_path())?;
    fs::read_file(path.to_str().ok_or("File path is not valid UTF-8")?)
}

#[tauri::command]
fn write(
    dir_path: &str,
    content: &str,
    workspace: tauri::State<workspace::WorkspacePolicy>,
) -> Result<(), String> {
    let path = workspace.writable_path(PathBuf::from(dir_path).as_path())?;
    fs::write_file(
        path.to_str().ok_or("File path is not valid UTF-8")?,
        content,
    )
}

#[tauri::command]
fn delete_file(
    dir_path: &str,
    workspace: tauri::State<workspace::WorkspacePolicy>,
) -> Result<(), String> {
    let path = workspace.removal_path(PathBuf::from(dir_path).as_path())?;
    fs::remove_file(path.to_str().ok_or("File path is not valid UTF-8")?)
}

#[tauri::command]
fn delete_folder(
    dir_path: &str,
    workspace: tauri::State<workspace::WorkspacePolicy>,
) -> Result<(), String> {
    let path = workspace.removal_path(PathBuf::from(dir_path).as_path())?;
    if path == workspace.root()? {
        return Err("Cannot delete the active workspace".to_string());
    }
    fs::remove_folder(path.to_str().ok_or("Folder path is not valid UTF-8")?)
}

#[tauri::command]
fn create_folder(
    dir_path: &str,
    workspace: tauri::State<workspace::WorkspacePolicy>,
) -> Result<(), String> {
    let path = workspace.writable_path(PathBuf::from(dir_path).as_path())?;
    fs::create_folder(path.to_str().ok_or("Folder path is not valid UTF-8")?)
}

#[tauri::command]
fn reveal_in_file_manager(
    path: &str,
    workspace: tauri::State<workspace::WorkspacePolicy>,
) -> Result<(), String> {
    let path = workspace.existing_path(PathBuf::from(path).as_path())?;
    fs::reveal_in_file_manager(path.to_str().ok_or("Path is not valid UTF-8")?)
}

#[tauri::command]
fn watch_changes(
    dir_path: String,
    app_handle: AppHandle,
    workspace: tauri::State<workspace::WorkspacePolicy>,
    watcher_state: tauri::State<WatcherState>,
    agents: tauri::State<agent::AgentManager>,
    terminals: tauri::State<terminal::TerminalManager>,
    language_server: tauri::State<lsp::LspManager>,
    searches: tauri::State<search::SearchManager>,
) -> Result<(), String> {
    let path = PathBuf::from(&dir_path)
        .canonicalize()
        .map_err(|error| format!("Workspace does not exist: {error}"))?;
    if !path.is_dir() {
        return Err(format!("Workspace does not exist: {dir_path}"));
    }

    let event_app = app_handle;
    let mut watcher = RecommendedWatcher::new(
        move |event: Result<notify::Event, notify::Error>| {
            if event.is_ok() {
                let _ = event_app.emit("file-changed", "CHANGE");
            }
        },
        Config::default().with_poll_interval(Duration::from_secs(2)),
    )
    .map_err(|error| error.to_string())?;
    watcher
        .watch(&path, RecursiveMode::Recursive)
        .map_err(|error| error.to_string())?;

    let changed = workspace.root().is_ok_and(|root| root != path);
    workspace.set_root(&path)?;
    if changed {
        agents.shutdown_all()?;
        terminals.shutdown_all()?;
        language_server.shutdown()?;
        searches.cancel_all()?;
    }
    *watcher_state
        .0
        .lock()
        .map_err(|_| "Watcher state poisoned")? = Some(watcher);
    Ok(())
}
fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let window = app
                .get_webview_window("main")
                .ok_or("Main window not found")?;
            window.set_shadow(false)?;

            #[cfg(target_os = "macos")]
            {
                window.set_effects(
                    EffectsBuilder::new()
                        .effect(Effect::UnderWindowBackground)
                        .state(EffectState::FollowsWindowActiveState)
                        .radius(14.0)
                        .build(),
                )?;
            }

            #[cfg(target_os = "windows")]
            {
                window.set_effects(
                    EffectsBuilder::new()
                        .effects([Effect::Mica, Effect::Acrylic])
                        .build(),
                )?;
            }

            Ok(())
        })
        .plugin(tauri_plugin_dialog::init())
        .manage(agent::AgentManager::default())
        .manage(workspace::WorkspacePolicy::default())
        .manage(WatcherState::default())
        .manage(terminal::TerminalManager::default())
        .manage(lsp::LspManager::default())
        .manage(search::SearchManager::default())
        .menu(menu::menu_bar)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "terminal" => {
                let _ = app.emit("terminal-toggle", ());
            }
            "open" => {
                let _ = app.emit("open_dir", String::from("open"));
            }
            "theme" => {
                let _ = app.emit("theme", String::from("theme"));
            }
            "swap" => {
                let _ = app.emit("swap", String::from("swap"));
            }
            "new_file" => {
                let _ = app.emit("new_file", String::from("file"));
            }
            "new_folder" => {
                let _ = app.emit("new_folder", String::from("folder"));
            }
            "toggle_sidebar" => {
                let _ = app.emit("toggle_sidebar", ());
            }
            "toggle_agent" => {
                let _ = app.emit("toggle_agent", ());
            }
            _ => {}
        })
        .invoke_handler(tauri::generate_handler![
            open,
            get_contents,
            write,
            delete_file,
            delete_folder,
            create_folder,
            reveal_in_file_manager,
            watch_changes,
            terminal::terminal_create,
            terminal::terminal_write,
            terminal::terminal_resize,
            terminal::terminal_close,
            agent::agent_start_session,
            agent::agent_send,
            agent::agent_interrupt,
            agent::agent_respond_approval,
            agent::agent_end_session,
            agent::agent_list_files,
            agent::agent_list_skills,
            agent::profiles::agent_profiles,
            agent::profiles::agent_probe_profile,
            agent::storage::agent_load_config,
            agent::storage::agent_save_config,
            agent::storage::agent_save_provider_connection,
            agent::storage::agent_provider_statuses,
            lsp::lsp_start,
            lsp::lsp_restart,
            lsp::lsp_stop,
            lsp::lsp_request,
            lsp::lsp_document_event,
            search::search_workspace,
            search::cancel_workspace_search,
            git::git_snapshot,
            git::git_stage,
            git::git_unstage,
            git::git_commit,
            git::git_diff,
            git::git_show
        ])
        .run(tauri::generate_context!())
        .expect("Rocket launch failed");
}
