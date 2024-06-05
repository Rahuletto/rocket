use std::{ thread, time::Duration};
use std::sync::mpsc::{channel, Sender, Receiver};
use notify::{Config, RecommendedWatcher, RecursiveMode, Watcher};
use tauri::Manager;

mod fs;

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
fn watch_changes(dir_path: String, app_handle: tauri::AppHandle) {
    thread::spawn(move || {
        let path = std::path::PathBuf::from(&dir_path);
        let (tx, rx): (Sender<Result<notify::Event, notify::Error>>, Receiver<Result<notify::Event, notify::Error>>) = channel();
        let mut watcher: RecommendedWatcher = Watcher::new(
            tx,
            Config::default().with_poll_interval(Duration::from_secs(2)),
        )
        .unwrap();
        watcher.watch(&path, RecursiveMode::Recursive).unwrap();

        loop {
            match rx.recv() {
                Ok(event) => {
                    match event {
                        _payload => {
                            app_handle
                                .emit_all("file-changed", fs::read_directory(&dir_path))
                                .unwrap();
                        }
                    }
                }
                Err(e) => println!("Thread fail 🧵: {:?}", e),
            }
        }
    });
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            open,
            get_contents,
            write,
            delete_file,
            delete_folder,
            create_folder,
            watch_changes
        ])
        .run(tauri::generate_context!())
        .expect("Rocket launch failed! 🚀💥");
}
