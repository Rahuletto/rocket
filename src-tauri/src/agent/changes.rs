use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::fs::{self, File, OpenOptions};
use std::io::{Read, Write};
use std::path::{Component, Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

use super::SKIP_DIRS;

const MAX_FILES: usize = 20_000;
const MAX_FILE_BYTES: u64 = 16 * 1024 * 1024;
const MAX_BASELINE_BYTES: u64 = 128 * 1024 * 1024;
static NEXT_TEMP_FILE: AtomicU64 = AtomicU64::new(0);

#[derive(Debug)]
pub struct ChangeTracker {
    pub root: PathBuf,
    pub generation: u64,
    baseline: HashMap<PathBuf, BaselineFile>,
    owned: HashMap<PathBuf, Option<Vec<u8>>>,
    conflicts: HashSet<PathBuf>,
}

#[derive(Clone, Debug)]
struct BaselineFile {
    bytes: Vec<u8>,
    #[cfg(unix)]
    mode: u32,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReviewChange {
    pub path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub old_path: Option<String>,
    pub kind: &'static str,
    pub additions: usize,
    pub deletions: usize,
    pub patch: String,
    pub conflict: bool,
}

impl ChangeTracker {
    pub fn capture(root: PathBuf, generation: u64) -> Result<Self, String> {
        let root = fs::canonicalize(root)
            .map_err(|error| format!("Could not resolve tracker workspace: {error}"))?;
        let mut baseline = HashMap::new();
        let mut count = 0;
        let mut bytes = 0;
        capture_dir(&root, &root, &mut baseline, &mut count, &mut bytes)?;
        Ok(Self {
            root,
            generation,
            baseline,
            owned: HashMap::new(),
            conflicts: HashSet::new(),
        })
    }

    fn relative(&self, path: &Path) -> Result<PathBuf, String> {
        let candidate = if path.is_absolute() {
            path.strip_prefix(&self.root)
                .map_err(|_| "Requested path is outside the tracker workspace")?
        } else {
            path
        };
        if candidate.components().any(|part| {
            matches!(
                part,
                Component::ParentDir | Component::RootDir | Component::Prefix(_)
            )
        }) {
            return Err("Requested path is outside the tracker workspace".into());
        }
        let candidate: PathBuf = candidate
            .components()
            .filter_map(|part| match part {
                Component::Normal(value) => Some(value),
                Component::CurDir => None,
                _ => None,
            })
            .collect();
        if candidate.as_os_str().is_empty()
            || candidate.components().any(|part| {
                matches!(part, Component::Normal(value) if SKIP_DIRS.contains(&value.to_string_lossy().as_ref()))
            })
        {
            return Err("Change tracking excludes this path".into());
        }
        let full = self.root.join(&candidate);
        let mut checked = self.root.clone();
        for component in candidate.components() {
            checked.push(component.as_os_str());
            match fs::symlink_metadata(&checked) {
                Ok(metadata) if metadata.file_type().is_symlink() => {
                    return Err("Change tracking does not follow symlinks".into());
                }
                Ok(_) => {}
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => break,
                Err(error) => {
                    return Err(format!("Could not inspect {}: {error}", checked.display()))
                }
            }
        }
        if let Ok(metadata) = fs::symlink_metadata(&full) {
            if !metadata.file_type().is_file() {
                return Err("Change tracking does not follow symlinks".into());
            }
        }
        let parent = full.parent().ok_or("Path has no parent")?;
        let existing_parent = nearest_existing(parent)?;
        let canonical = fs::canonicalize(existing_parent).map_err(|e| e.to_string())?;
        if !canonical.starts_with(&self.root) {
            return Err("Requested path is outside the tracker workspace".into());
        }
        Ok(candidate)
    }

    fn read(&self, relative: &Path) -> Result<Option<Vec<u8>>, String> {
        let full = self.root.join(relative);
        match File::open(&full) {
            Ok(file) => {
                let mut bytes = Vec::new();
                file.take(MAX_FILE_BYTES + 1)
                    .read_to_end(&mut bytes)
                    .map_err(|error| format!("Could not read {}: {error}", relative.display()))?;
                if bytes.len() as u64 > MAX_FILE_BYTES {
                    return Err(format!(
                        "{} exceeds the supported file size",
                        relative.display()
                    ));
                }
                Ok(Some(bytes))
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
            Err(error) => Err(format!("Could not read {}: {error}", relative.display())),
        }
    }

    pub fn attribute(&mut self, path: &Path) -> Result<(), String> {
        let path = self.relative(path)?;
        let current = self.read(&path)?;
        if current.as_ref() == self.baseline.get(&path).map(|file| &file.bytes) {
            self.owned.remove(&path);
            self.conflicts.remove(&path);
        } else {
            self.owned.insert(path, current);
        }
        Ok(())
    }

    pub fn user_edited(&mut self, path: &Path, saved: Option<Vec<u8>>) -> Result<(), String> {
        let path = self.relative(path)?;
        let current = match saved {
            Some(value) => {
                if value.len() as u64 > MAX_FILE_BYTES {
                    return Err(format!(
                        "{} exceeds the supported file size",
                        path.display()
                    ));
                }
                Some(value)
            }
            None => self.read(&path)?,
        };
        if let Some(observed) = self.owned.get(&path) {
            if observed != &current {
                self.conflicts.insert(path);
            }
        } else {
            match current {
                Some(value) => {
                    let baseline = baseline_file(value, &self.root.join(&path))?;
                    self.baseline.insert(path, baseline);
                }
                None => {
                    self.baseline.remove(&path);
                }
            }
        }
        Ok(())
    }

    pub fn review(&self) -> Result<Vec<ReviewChange>, String> {
        let mut paths: Vec<_> = self.owned.keys().cloned().collect();
        paths.sort();
        let mut changes = Vec::new();
        for path in paths {
            changes.push(self.change(&path)?);
        }
        changes.sort_by(|a, b| a.path.cmp(&b.path));
        Ok(changes)
    }

    pub fn reconcile(&mut self) -> Result<(), String> {
        let mut current = HashMap::new();
        let mut count = 0;
        let mut bytes = 0;
        capture_dir(&self.root, &self.root, &mut current, &mut count, &mut bytes)?;
        let paths: HashSet<_> = self
            .baseline
            .keys()
            .chain(current.keys())
            .cloned()
            .collect();
        for path in paths {
            let before = self.baseline.get(&path).map(|file| &file.bytes);
            let after = current.get(&path).map(|file| &file.bytes);
            if before == after {
                continue;
            }
            let after = after.cloned();
            if let Some(observed) = self.owned.get(&path) {
                if observed != &after {
                    self.conflicts.insert(path);
                }
            } else {
                // A turn changed this path without a structured file event (for
                // example through a shell command). Include it in review, but do
                // not claim exclusive ownership: an external writer may have
                // raced the turn, so reverting requires explicit confirmation.
                self.owned.insert(path.clone(), after);
                self.conflicts.insert(path);
            }
        }
        Ok(())
    }

    fn change(&self, path: &Path) -> Result<ReviewChange, String> {
        let before = self.baseline.get(path).map(|file| &file.bytes);
        let after = self.read(path)?;
        let kind = match (before, &after) {
            (None, Some(_)) => "created",
            (Some(_), None) => "deleted",
            _ => "modified",
        };
        let before_lines = line_count(before.map(Vec::as_slice));
        let after_lines = line_count(after.as_deref());
        Ok(ReviewChange {
            path: display(path),
            old_path: None,
            kind,
            additions: after_lines,
            deletions: before_lines,
            patch: unified(path, path, before.map(Vec::as_slice), after.as_deref()),
            conflict: self.conflicts.contains(path)
                || self
                    .owned
                    .get(path)
                    .is_some_and(|observed| observed != &after),
        })
    }

    pub fn keep(&mut self, path: Option<&Path>) -> Result<(), String> {
        self.finish(path, false, false)
    }
    pub fn revert(&mut self, path: Option<&Path>, force: bool) -> Result<(), String> {
        self.finish(path, true, force)
    }

    fn finish(&mut self, selected: Option<&Path>, revert: bool, force: bool) -> Result<(), String> {
        let targets: Vec<PathBuf> = if let Some(path) = selected {
            let path = self.relative(path)?;
            if !self.owned.contains_key(&path) {
                return Err("Path is not an owned change".into());
            }
            vec![path]
        } else {
            self.owned.keys().cloned().collect()
        };
        // Read every selected target up front. Besides detecting conflicts before
        // mutation, this deliberately propagates permission and oversized-file errors.
        let mut current = HashMap::new();
        for path in &targets {
            current.insert(path.clone(), self.read(path)?);
        }
        if revert
            && !force
            && targets.iter().any(|path| {
                self.conflicts.contains(path) || self.owned.get(path) != current.get(path)
            })
        {
            return Err(
                "File changed outside the agent. Confirm a forced revert to discard that edit."
                    .into(),
            );
        }

        let mut staged = HashMap::new();
        if revert {
            for path in &targets {
                if let Some(file) = self.baseline.get(path) {
                    let destination = self.root.join(path);
                    let parent = destination.parent().ok_or("Path has no parent")?;
                    fs::create_dir_all(parent).map_err(|e| e.to_string())?;
                    let (temp, mut output) = create_temp_file(parent)?;
                    if let Err(error) = output
                        .write_all(&file.bytes)
                        .and_then(|_| output.sync_all())
                    {
                        let _ = fs::remove_file(&temp);
                        for staged_temp in staged.values() {
                            let _ = fs::remove_file(staged_temp);
                        }
                        return Err(error.to_string());
                    }
                    drop(output);
                    set_mode(&temp, file)?;
                    staged.insert(path.clone(), temp);
                }
            }
            for path in &targets {
                if let Some(temp) = staged.remove(path) {
                    fs::rename(temp, self.root.join(path)).map_err(|e| e.to_string())?;
                } else {
                    match fs::remove_file(self.root.join(path)) {
                        Ok(()) => (),
                        Err(e) if e.kind() == std::io::ErrorKind::NotFound => (),
                        Err(e) => return Err(e.to_string()),
                    }
                }
            }
        } else {
            for path in &targets {
                match current.remove(path).flatten() {
                    Some(bytes) => {
                        self.baseline
                            .insert(path.clone(), baseline_file(bytes, &self.root.join(path))?);
                    }
                    None => {
                        self.baseline.remove(path);
                    }
                }
            }
        }
        // Ownership is retained if any operation above fails.
        for path in targets {
            self.owned.remove(&path);
            self.conflicts.remove(&path);
        }
        Ok(())
    }
}

fn capture_dir(
    root: &Path,
    dir: &Path,
    out: &mut HashMap<PathBuf, BaselineFile>,
    count: &mut usize,
    total: &mut u64,
) -> Result<(), String> {
    for entry in
        fs::read_dir(dir).map_err(|e| format!("Could not capture session baseline: {e}"))?
    {
        let entry = entry.map_err(|e| format!("Could not capture session baseline: {e}"))?;
        let ty = entry.file_type().map_err(|e| e.to_string())?;
        if ty.is_symlink() {
            continue;
        }
        if ty.is_dir() {
            if !SKIP_DIRS.contains(&entry.file_name().to_string_lossy().as_ref()) {
                capture_dir(root, &entry.path(), out, count, total)?;
            }
            continue;
        }
        if !ty.is_file() {
            continue;
        }
        let mut content = Vec::new();
        File::open(entry.path())
            .and_then(|file| file.take(MAX_FILE_BYTES + 1).read_to_end(&mut content))
            .map_err(|e| e.to_string())?;
        if content.len() as u64 > MAX_FILE_BYTES {
            return Err(format!(
                "Cannot start agent: {} exceeds the {} MiB baseline file limit",
                entry.path().display(),
                MAX_FILE_BYTES / 1024 / 1024
            ));
        }
        *count += 1;
        *total += content.len() as u64;
        if *count > MAX_FILES || *total > MAX_BASELINE_BYTES {
            return Err(format!("Cannot start agent: workspace baseline exceeds {MAX_FILES} files or {} MiB. Exclude generated files using a standard ignored directory.", MAX_BASELINE_BYTES / 1024 / 1024));
        }
        out.insert(
            entry.path().strip_prefix(root).unwrap().to_path_buf(),
            baseline_file(content, &entry.path())?,
        );
    }
    Ok(())
}
fn baseline_file(bytes: Vec<u8>, path: &Path) -> Result<BaselineFile, String> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mode = fs::metadata(path)
            .map_err(|e| e.to_string())?
            .permissions()
            .mode();
        Ok(BaselineFile { bytes, mode })
    }
    #[cfg(not(unix))]
    {
        let _ = path;
        Ok(BaselineFile { bytes })
    }
}
fn set_mode(path: &Path, file: &BaselineFile) -> Result<(), String> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(path, fs::Permissions::from_mode(file.mode))
            .map_err(|e| e.to_string())?;
    }
    let _ = (path, file);
    Ok(())
}
fn create_temp_file(parent: &Path) -> Result<(PathBuf, File), String> {
    for _ in 0..100 {
        let sequence = NEXT_TEMP_FILE.fetch_add(1, Ordering::Relaxed);
        let path = parent.join(format!(".rocket-revert-{}-{sequence}", std::process::id()));
        match OpenOptions::new().write(true).create_new(true).open(&path) {
            Ok(file) => return Ok((path, file)),
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(error.to_string()),
        }
    }
    Err("Could not allocate a safe temporary file for revert".into())
}
fn nearest_existing(mut path: &Path) -> Result<&Path, String> {
    while !path.exists() {
        path = path
            .parent()
            .ok_or("Path has no existing workspace ancestor")?;
    }
    Ok(path)
}
fn display(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}
fn line_count(value: Option<&[u8]>) -> usize {
    value.filter(|v| !v.is_empty()).map_or(0, |v| {
        v.split(|b| *b == b'\n').count() - usize::from(v.ends_with(b"\n"))
    })
}
fn unified(old: &Path, new: &Path, before: Option<&[u8]>, after: Option<&[u8]>) -> String {
    let a = String::from_utf8_lossy(before.unwrap_or_default());
    let b = String::from_utf8_lossy(after.unwrap_or_default());
    let ac = line_count(before);
    let bc = line_count(after);
    let mut patch = format!(
        "--- a/{}\n+++ b/{}\n@@ -1,{ac} +1,{bc} @@\n",
        display(old),
        display(new)
    );
    for line in a.split_inclusive('\n') {
        patch.push('-');
        patch.push_str(line);
        if !line.ends_with('\n') {
            patch.push('\n');
        }
    }
    for line in b.split_inclusive('\n') {
        patch.push('+');
        patch.push_str(line);
        if !line.ends_with('\n') {
            patch.push('\n');
        }
    }
    patch
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::time::{SystemTime, UNIX_EPOCH};
    static NEXT_TEMP: AtomicUsize = AtomicUsize::new(0);
    fn setup() -> (PathBuf, ChangeTracker) {
        let root = std::env::temp_dir().join(format!(
            "rocket-changes-{}-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos(),
            NEXT_TEMP.fetch_add(1, Ordering::Relaxed)
        ));
        fs::create_dir_all(&root).unwrap();
        fs::write(root.join("dirty.txt"), b"user dirty\n").unwrap();
        let tracker = ChangeTracker::capture(root.clone(), 1).unwrap();
        (root, tracker)
    }
    #[test]
    fn modify_and_revert_preserves_dirty_baseline_without_git() {
        let (r, mut t) = setup();
        fs::write(r.join("dirty.txt"), b"agent\n").unwrap();
        t.attribute(Path::new("dirty.txt")).unwrap();
        assert_eq!(t.review().unwrap()[0].kind, "modified");
        t.revert(Some(Path::new("dirty.txt")), false).unwrap();
        assert_eq!(fs::read(r.join("dirty.txt")).unwrap(), b"user dirty\n");
        fs::remove_dir_all(r).unwrap();
    }
    #[test]
    fn duplicate_content_is_independent_create_and_delete() {
        let (r, mut t) = setup();
        fs::write(r.join("new"), b"new").unwrap();
        t.attribute(Path::new("new")).unwrap();
        fs::remove_file(r.join("dirty.txt")).unwrap();
        fs::write(r.join("moved.txt"), b"user dirty\n").unwrap();
        t.attribute(Path::new("dirty.txt")).unwrap();
        t.attribute(Path::new("moved.txt")).unwrap();
        let review = t.review().unwrap();
        assert!(review.iter().any(|c| c.kind == "created"));
        assert!(review
            .iter()
            .any(|c| c.path == "dirty.txt" && c.kind == "deleted"));
        assert!(review
            .iter()
            .any(|c| c.path == "moved.txt" && c.kind == "created"));
        t.revert(Some(Path::new("moved.txt")), false).unwrap();
        assert!(!r.join("dirty.txt").exists());
        assert!(!r.join("moved.txt").exists());
        assert_eq!(t.review().unwrap().len(), 2);
        t.revert(Some(Path::new("dirty.txt")), false).unwrap();
        assert!(r.join("dirty.txt").exists());
        fs::remove_dir_all(r).unwrap();
    }
    #[test]
    fn delete_restores_bytes() {
        let (r, mut t) = setup();
        fs::remove_file(r.join("dirty.txt")).unwrap();
        t.attribute(Path::new("dirty.txt")).unwrap();
        assert_eq!(t.review().unwrap()[0].kind, "deleted");
        t.revert(None, false).unwrap();
        assert_eq!(fs::read(r.join("dirty.txt")).unwrap(), b"user dirty\n");
        fs::remove_dir_all(r).unwrap();
    }
    #[test]
    fn user_conflict_requires_force_and_keep_updates_baseline() {
        let (r, mut t) = setup();
        fs::write(r.join("dirty.txt"), b"agent").unwrap();
        t.attribute(Path::new("dirty.txt")).unwrap();
        fs::write(r.join("dirty.txt"), b"user").unwrap();
        t.user_edited(Path::new("dirty.txt"), Some(b"user".to_vec()))
            .unwrap();
        assert!(t.revert(None, false).is_err());
        t.revert(None, true).unwrap();
        assert_eq!(fs::read(r.join("dirty.txt")).unwrap(), b"user dirty\n");
        fs::write(r.join("dirty.txt"), b"kept").unwrap();
        t.attribute(Path::new("dirty.txt")).unwrap();
        t.keep(None).unwrap();
        assert!(t.review().unwrap().is_empty());
        fs::remove_dir_all(r).unwrap();
    }
    #[test]
    fn clean_user_save_is_not_a_conflict() {
        let (r, mut t) = setup();
        fs::write(r.join("dirty.txt"), b"agent").unwrap();
        t.attribute(Path::new("dirty.txt")).unwrap();
        t.user_edited(Path::new("dirty.txt"), Some(b"agent".to_vec()))
            .unwrap();
        assert!(!t.review().unwrap()[0].conflict);
        fs::remove_dir_all(r).unwrap();
    }
    #[test]
    fn excluded_and_intermediate_symlink_paths_are_rejected() {
        let (r, mut t) = setup();
        fs::create_dir_all(r.join("node_modules")).unwrap();
        fs::write(r.join("node_modules/x"), b"x").unwrap();
        assert!(t.attribute(Path::new("node_modules/x")).is_err());
        #[cfg(unix)]
        {
            std::os::unix::fs::symlink(&r, r.join("link")).unwrap();
            assert!(t.attribute(Path::new("link/dirty.txt")).is_err());
        }
        fs::remove_dir_all(r).unwrap();
    }
    #[test]
    fn reconcile_surfaces_unreported_command_changes_as_conflicts() {
        let (r, mut t) = setup();
        fs::write(r.join("dirty.txt"), b"command edit").unwrap();
        fs::write(r.join("generated.txt"), b"generated").unwrap();
        t.reconcile().unwrap();
        let review = t.review().unwrap();
        assert_eq!(review.len(), 2);
        assert!(review.iter().all(|change| change.conflict));
        assert!(t.revert(None, false).is_err());
        t.revert(None, true).unwrap();
        assert_eq!(fs::read(r.join("dirty.txt")).unwrap(), b"user dirty\n");
        assert!(!r.join("generated.txt").exists());
        fs::remove_dir_all(r).unwrap();
    }
    #[test]
    fn user_edit_before_ownership_becomes_baseline_and_confinement_holds() {
        let (r, mut t) = setup();
        fs::write(r.join("dirty.txt"), b"saved").unwrap();
        t.user_edited(Path::new("dirty.txt"), Some(b"saved".to_vec()))
            .unwrap();
        fs::write(r.join("dirty.txt"), b"agent").unwrap();
        t.attribute(Path::new("dirty.txt")).unwrap();
        t.revert(None, false).unwrap();
        assert_eq!(fs::read(r.join("dirty.txt")).unwrap(), b"saved");
        assert!(t.attribute(Path::new("../escape")).is_err());
        fs::remove_dir_all(r).unwrap();
    }
}
