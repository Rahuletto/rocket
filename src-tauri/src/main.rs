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
mod menu;
mod terminal;

#[derive(Default)]
struct WorkspaceState(Mutex<Option<PathBuf>>);

#[derive(Default)]
struct WatcherState(Mutex<Option<RecommendedWatcher>>);

#[tauri::command]
fn open(folder_path: &str) -> Result<Vec<fs::FileStruct>, String> {
    fs::read_directory(folder_path)
}

#[tauri::command]
fn get_contents(dir_path: &str) -> Result<String, String> {
    fs::read_file(dir_path)
}

#[tauri::command]
fn write(dir_path: &str, content: &str) -> Result<(), String> {
    fs::write_file(dir_path, content)
}

#[tauri::command]
fn delete_file(dir_path: &str) -> Result<(), String> {
    fs::remove_file(dir_path)
}

#[tauri::command]
fn delete_folder(dir_path: &str) -> Result<(), String> {
    fs::remove_folder(dir_path)
}

#[tauri::command]
fn create_folder(dir_path: &str) -> Result<(), String> {
    fs::create_folder(dir_path)
}

#[tauri::command]
fn reveal_in_file_manager(path: &str) -> Result<(), String> {
    fs::reveal_in_file_manager(path)
}

#[tauri::command]
fn watch_changes(
    dir_path: String,
    app_handle: AppHandle,
    workspace: tauri::State<WorkspaceState>,
    watcher_state: tauri::State<WatcherState>,
) -> Result<(), String> {
    let path = PathBuf::from(&dir_path);
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

    *workspace.0.lock().map_err(|_| "Workspace state poisoned")? = Some(path);
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
        .manage(WorkspaceState::default())
        .manage(WatcherState::default())
        .manage(terminal::TerminalManager::default())
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
            agent::agent_list_files,
            agent::agent_list_skills,
            agent::storage::agent_load_config,
            agent::storage::agent_save_config,
            agent::storage::agent_save_provider_connection,
            agent::storage::agent_provider_statuses,
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
