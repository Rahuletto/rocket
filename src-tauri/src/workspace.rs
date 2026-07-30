use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

#[derive(Default)]
struct WorkspaceAccess {
    generation: u64,
    root: Option<PathBuf>,
}

#[derive(Clone, Default)]
pub struct WorkspacePolicy(Arc<Mutex<WorkspaceAccess>>);

impl WorkspacePolicy {
    pub fn validate_root(&self, path: &Path) -> Result<PathBuf, String> {
        canonical_directory(path, "Workspace")
    }

    pub fn set_root(&self, path: &Path) -> Result<PathBuf, String> {
        let root = self.validate_root(path)?;
        let mut access = self.0.lock().map_err(|_| "Workspace state poisoned")?;
        if access.root.as_ref() != Some(&root) {
            access.root = Some(root.clone());
            access.generation = access.generation.wrapping_add(1);
        }
        Ok(root)
    }

    pub fn require_root(&self, path: &Path) -> Result<PathBuf, String> {
        self.require_root_with_generation(path)
            .map(|(root, _)| root)
    }

    pub fn require_root_with_generation(&self, path: &Path) -> Result<(PathBuf, u64), String> {
        let requested = canonical_directory(path, "Workspace")?;
        let access = self.0.lock().map_err(|_| "Workspace state poisoned")?;
        if access.root.as_ref() != Some(&requested) {
            return Err("Requested workspace is not the active workspace".to_string());
        }
        Ok((requested, access.generation))
    }

    pub fn existing_path(&self, path: &Path) -> Result<PathBuf, String> {
        let requested = fs::canonicalize(path).map_err(|error| error.to_string())?;
        self.ensure_within_root(&requested)
    }

    pub fn writable_path(&self, path: &Path) -> Result<PathBuf, String> {
        match fs::symlink_metadata(path) {
            Ok(_) => return self.existing_path(path),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => return Err(error.to_string()),
        }
        let name = path
            .file_name()
            .ok_or("Requested path must have a file name")?;
        let parent = path.parent().ok_or("Requested path must have a parent")?;
        let canonical_parent = fs::canonicalize(parent).map_err(|error| error.to_string())?;
        self.ensure_within_root(&canonical_parent.join(name))
    }

    pub fn removal_path(&self, path: &Path) -> Result<PathBuf, String> {
        fs::symlink_metadata(path).map_err(|error| error.to_string())?;
        let name = path
            .file_name()
            .ok_or("Requested path must have a file name")?;
        let parent = path.parent().ok_or("Requested path must have a parent")?;
        let canonical_parent = fs::canonicalize(parent).map_err(|error| error.to_string())?;
        self.ensure_within_root(&canonical_parent.join(name))
    }

    pub fn root(&self) -> Result<PathBuf, String> {
        self.0
            .lock()
            .map_err(|_| "Workspace state poisoned")?
            .root
            .clone()
            .ok_or_else(|| "Open a workspace before accessing files".to_string())
    }

    pub fn is_current(&self, generation: u64) -> bool {
        self.0
            .lock()
            .is_ok_and(|access| access.root.is_some() && access.generation == generation)
    }

    fn ensure_within_root(&self, requested: &Path) -> Result<PathBuf, String> {
        let root = self.root()?;
        if requested.starts_with(&root) {
            Ok(requested.to_path_buf())
        } else {
            Err("Requested path is outside the active workspace".to_string())
        }
    }
}

fn canonical_directory(path: &Path, label: &str) -> Result<PathBuf, String> {
    let canonical = fs::canonicalize(path).map_err(|error| format!("Invalid {label}: {error}"))?;
    if !canonical.is_dir() {
        return Err(format!("{label} is not a directory"));
    }
    Ok(canonical)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_workspace() -> PathBuf {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!("rocket-workspace-{suffix}"));
        fs::create_dir_all(root.join("src")).unwrap();
        root
    }

    #[test]
    fn accepts_existing_and_new_paths_inside_the_workspace() {
        let root = temp_workspace();
        let policy = WorkspacePolicy::default();
        let root = policy.set_root(&root).unwrap();
        let existing = root.join("src");
        let new_file = existing.join("main.rs");

        assert_eq!(policy.existing_path(&existing).unwrap(), existing);
        assert_eq!(policy.writable_path(&new_file).unwrap(), new_file);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn validating_a_root_does_not_change_the_active_workspace() {
        let first = temp_workspace();
        let second = temp_workspace();
        let policy = WorkspacePolicy::default();
        let active = policy.set_root(&first).unwrap();

        assert_eq!(
            policy.validate_root(&second).unwrap(),
            fs::canonicalize(&second).unwrap()
        );
        assert_eq!(policy.root().unwrap(), active);
        fs::remove_dir_all(first).unwrap();
        fs::remove_dir_all(second).unwrap();
    }

    #[test]
    fn rejects_traversal_outside_the_workspace() {
        let root = temp_workspace();
        let policy = WorkspacePolicy::default();
        policy.set_root(&root).unwrap();
        let outside = root.join("..").join("outside.txt");

        assert!(policy.writable_path(&outside).is_err());
        fs::remove_dir_all(root).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn rejects_symlinks_that_escape_the_workspace() {
        use std::os::unix::fs::symlink;

        let root = temp_workspace();
        let outside = std::env::temp_dir().join(format!(
            "rocket-outside-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&outside).unwrap();
        symlink(&outside, root.join("escaped")).unwrap();
        let policy = WorkspacePolicy::default();
        policy.set_root(&root).unwrap();

        assert!(policy.existing_path(&root.join("escaped")).is_err());
        assert!(policy.writable_path(&root.join("escaped/new.txt")).is_err());
        fs::remove_dir_all(root).unwrap();
        fs::remove_dir_all(outside).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn rejects_writes_through_dangling_symlinks() {
        use std::os::unix::fs::symlink;

        let root = temp_workspace();
        let outside = root.with_extension("missing-target");
        symlink(&outside, root.join("dangling")).unwrap();
        let policy = WorkspacePolicy::default();
        policy.set_root(&root).unwrap();

        assert!(policy.writable_path(&root.join("dangling")).is_err());
        assert!(!outside.exists());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn changing_roots_invalidates_in_flight_operations() {
        let first = temp_workspace();
        let second = temp_workspace();
        let policy = WorkspacePolicy::default();
        policy.set_root(&first).unwrap();
        let (_, generation) = policy.require_root_with_generation(&first).unwrap();

        policy.set_root(&second).unwrap();

        assert!(!policy.is_current(generation));
        fs::remove_dir_all(first).unwrap();
        fs::remove_dir_all(second).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn removal_returns_the_symlink_instead_of_its_target() {
        use std::os::unix::fs::symlink;

        let root = temp_workspace();
        let target = root.join("src");
        let link = root.join("src-link");
        symlink(&target, &link).unwrap();
        let policy = WorkspacePolicy::default();
        let root = policy.set_root(&root).unwrap();

        assert_eq!(policy.removal_path(&link).unwrap(), root.join("src-link"));
        fs::remove_file(link).unwrap();
        fs::remove_dir_all(root).unwrap();
    }
}
