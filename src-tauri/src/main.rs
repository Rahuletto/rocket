use notify::{Config, RecommendedWatcher, RecursiveMode, Watcher};
use std::sync::mpsc::{channel, Receiver, Sender};
use std::{thread, time::Duration};
use tauri::{AppHandle, Manager};

mod fs;
mod menu;

static mut FOLDER: String = String::new();

#[tauri::command]
fn open(folder_path: &str) -> String {
    let files = fs::read_directory(folder_path);
    files
}

#[tauri::command]
fn get_contents(dir_path: &str) -> String {
    let content = fs::read_file(dir_path);
    content
}

#[tauri::command]
fn write(dir_path: &str, content: &str) -> String {
    fs::write_file(dir_path, content);
    String::from("Success")
}

#[tauri::command]
fn delete_file(dir_path: &str) -> String {
    fs::remove_file(dir_path);
    String::from("Success")
}

#[tauri::command]
fn delete_folder(dir_path: &str) -> String {
    fs::remove_folder(dir_path);
    String::from("Success")
}

#[tauri::command]
fn create_folder(dir_path: &str) -> String {
    fs::create_folder(dir_path);
    String::from("Success")
}

#[tauri::command]
fn watch_changes(dir_path: String, app_handle: AppHandle) {
    unsafe {
        FOLDER = String::from(dir_path.clone());
    }

    thread::spawn(move || {
        let path = std::path::PathBuf::from(&dir_path);

        let (tx, rx): (
            Sender<Result<notify::Event, notify::Error>>,
            Receiver<Result<notify::Event, notify::Error>>,
        ) = channel();

        let mut watcher: RecommendedWatcher = Watcher::new(
            tx,
            Config::default().with_poll_interval(Duration::from_secs(2)),
        )
        .unwrap();

        watcher.watch(&path, RecursiveMode::Recursive).unwrap();

        loop {
            match rx.recv() {
                Ok(event) => match event {
                    Ok(_payload) => {
                        app_handle.emit_all("file-changed", "CHANGE").unwrap();
                    }
                    Err(e) => println!("Error handling event: {:?}", e),
                },
                Err(e) => println!("Thread fail 🧵: {:?}", e),
            }
        }
    });
}
#[tauri::command]
fn open_terminal(directory: String) -> String {
    #[cfg(target_os = "windows")]
    let cmd = format!("start cmd /K cd /d {}", directory);

    #[cfg(target_os = "macos")]
    let cmd = format!("open -a Terminal {}", directory);

    #[cfg(target_os = "linux")]
    let cmd = format!("gnome-terminal -- bash -c 'cd {}; exec bash'", directory);

    std::process::Command::new("sh")
        .arg("-c")
        .arg(cmd)
        .spawn()
        .map_err(|e| e.to_string())
        .expect("Error while opening Rocket Control panel! 🚀💥");

    String::from("Success")
}

fn main() {
    tauri::Builder::default()
        .menu(menu::menu_bar())
        .on_menu_event(|event| match event.menu_item_id() {
            "terminal" => unsafe {
                open_terminal(FOLDER.clone());
            },
            "open" => {
                event
                    .window()
                    .emit("open_dir", String::from("open"))
                    .unwrap();
            }
            "theme" => {
                event.window().emit("theme", String::from("theme")).unwrap();
            }
            "swap" => {
                event.window().emit("swap", String::from("swap")).unwrap();
            }
            "new_file" => {
                event
                    .window()
                    .emit("new_file", String::from("file"))
                    .unwrap();
            }
            "new_folder" => {
                event
                    .window()
                    .emit("new_folder", String::from("folder"))
                    .unwrap();
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
            watch_changes,
            open_terminal
        ])
        .run(tauri::generate_context!())
        .expect("Rocket launch failed! 🚀💥");
}
