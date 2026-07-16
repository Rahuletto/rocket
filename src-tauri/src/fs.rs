use serde::Serialize;
use std::fs;
use std::path::Path;
use std::process::Command;

#[derive(Serialize, Debug)]
pub struct FileStruct {
    pub name: String,
    pub kind: &'static str,
    pub path: String,
}

fn is_hidden_from_explorer(name: &str, is_directory: bool) -> bool {
    if name == ".git" {
        return true;
    }
    is_directory
        && matches!(
            name,
            "node_modules"
                | "target"
                | "dist"
                | "build"
                | ".next"
                | ".nuxt"
                | ".svelte-kit"
                | ".turbo"
                | ".cache"
                | "coverage"
                | "__pycache__"
                | ".venv"
                | "venv"
        )
}

pub fn read_directory(dir_path: &str) -> Result<Vec<FileStruct>, String> {
    let paths = fs::read_dir(Path::new(dir_path)).map_err(|error| error.to_string())?;
    let mut files = Vec::new();

    for entry in paths {
        let entry = entry.map_err(|error| error.to_string())?;
        let metadata = entry.metadata().map_err(|error| error.to_string())?;
        let name = entry.file_name().to_string_lossy().into_owned();
        if is_hidden_from_explorer(&name, metadata.is_dir()) {
            continue;
        }
        let path = entry.path().to_string_lossy().into_owned();
        files.push(FileStruct {
            name,
            kind: if metadata.is_dir() {
                "directory"
            } else {
                "file"
            },
            path,
        });
    }

    Ok(files)
}

pub fn read_file(path: &str) -> Result<String, String> {
    fs::read_to_string(Path::new(path)).map_err(|error| error.to_string())
}

pub fn write_file(path: &str, content: &str) -> Result<(), String> {
    fs::write(Path::new(path), content).map_err(|error| error.to_string())
}

pub fn create_folder(path: &str) -> Result<(), String> {
    fs::create_dir(Path::new(path)).map_err(|error| error.to_string())
}

pub fn remove_file(path: &str) -> Result<(), String> {
    fs::remove_file(Path::new(path)).map_err(|error| error.to_string())
}

pub fn remove_folder(path: &str) -> Result<(), String> {
    fs::remove_dir_all(Path::new(path)).map_err(|error| error.to_string())
}

pub fn reveal_in_file_manager(path: &str) -> Result<(), String> {
    let target = Path::new(path);
    if !target.exists() {
        return Err(format!("Path does not exist: {path}"));
    }

    #[cfg(target_os = "macos")]
    let status = Command::new("open").args(["-R", path]).status();

    #[cfg(target_os = "windows")]
    let status = Command::new("explorer").arg(format!("/select,{path}")).status();

    #[cfg(all(unix, not(target_os = "macos")))]
    let status = Command::new("xdg-open")
        .arg(target.parent().unwrap_or(target))
        .status();

    status
        .map_err(|error| error.to_string())?
        .success()
        .then_some(())
        .ok_or_else(|| "File manager failed to reveal path".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn directory_entries_use_joined_paths() {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!("rocket-fs-{suffix}"));
        fs::create_dir_all(&root).unwrap();
        let file = root.join("main.ts");
        fs::write(&file, "export {};").unwrap();

        let entries = read_directory(root.to_str().unwrap()).unwrap();

        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].path, file.to_string_lossy());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn binary_file_returns_typed_error() {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let file = std::env::temp_dir().join(format!("rocket-binary-{suffix}"));
        fs::write(&file, [0xff, 0xfe, 0xfd]).unwrap();

        let result = read_file(file.to_str().unwrap());

        assert!(result.is_err());
        fs::remove_file(file).unwrap();
    }

    #[test]
    fn explorer_omits_repository_and_dependency_internals() {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!("rocket-ignore-{suffix}"));
        fs::create_dir_all(root.join(".git")).unwrap();
        fs::create_dir_all(root.join("node_modules")).unwrap();
        fs::create_dir_all(root.join("src")).unwrap();

        let entries = read_directory(root.to_str().unwrap()).unwrap();
        let names: Vec<_> = entries.iter().map(|entry| entry.name.as_str()).collect();

        assert_eq!(names, vec!["src"]);
        fs::remove_dir_all(root).unwrap();
    }
}
