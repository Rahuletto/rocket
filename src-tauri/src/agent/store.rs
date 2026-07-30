use rusqlite::{params, Connection, OptionalExtension, Transaction};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet};
use std::fs::{self, File, OpenOptions};
use std::io::{Read, Write};
use std::path::{Component, Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

use super::SKIP_DIRS;
use crate::workspace::WorkspacePolicy;

const SCHEMA_VERSION: i64 = 1;
const MAX_SESSION_BYTES: usize = 4 * 1024 * 1024;
const MAX_FILE_BYTES: u64 = 16 * 1024 * 1024;
const MAX_SNAPSHOT_BYTES: u64 = 128 * 1024 * 1024;
const MAX_FILES: usize = 20_000;

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredSession {
    backend: String,
    id: String,
    #[serde(default)]
    opaque_session_id: Option<String>,
    #[serde(default)]
    profile_id: Option<String>,
    #[serde(default)]
    queue: Vec<String>,
    state: Value,
    title: String,
    #[serde(default)]
    updated_at: i64,
    workspace: String,
    #[serde(default)]
    worktree: Option<Value>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckpointSummary {
    id: i64,
    session_id: Option<String>,
    label: String,
    kind: String,
    created_at: i64,
    file_count: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RestoreResult {
    paths: Vec<String>,
}

pub fn rocket_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .home_dir()
        .map_err(|e| e.to_string())?
        .join(".rocket");
    fs::create_dir_all(&dir)
        .map_err(|e| format!("Could not create Rocket state directory: {e}"))?;
    private_dir(&dir)?;
    let blobs = dir.join("checkpoints");
    fs::create_dir_all(&blobs)
        .map_err(|e| format!("Could not create checkpoint blob directory: {e}"))?;
    private_dir(&blobs)?;
    Ok(dir)
}

fn open(dir: &Path) -> Result<Connection, String> {
    let path = dir.join("state.sqlite3");
    let conn = Connection::open(&path).map_err(db_error)?;
    conn.busy_timeout(std::time::Duration::from_secs(5))
        .map_err(db_error)?;
    conn.pragma_update(None, "journal_mode", "WAL")
        .map_err(db_error)?;
    conn.pragma_update(None, "foreign_keys", "ON")
        .map_err(db_error)?;
    migrate(&conn)?;
    private_file(&path)?;
    for suffix in ["-wal", "-shm"] {
        let sidecar = PathBuf::from(format!("{}{suffix}", path.display()));
        if sidecar.exists() {
            private_file(&sidecar)?;
        }
    }
    Ok(conn)
}

fn migrate(conn: &Connection) -> Result<(), String> {
    let tx = conn.unchecked_transaction().map_err(db_error)?;
    tx.execute_batch(
        "CREATE TABLE IF NOT EXISTS schema_meta(version INTEGER NOT NULL);
        INSERT INTO schema_meta(version) SELECT 0 WHERE NOT EXISTS(SELECT 1 FROM schema_meta);",
    )
    .map_err(db_error)?;
    let version: i64 = tx
        .query_row("SELECT version FROM schema_meta", [], |r| r.get(0))
        .map_err(db_error)?;
    if version > SCHEMA_VERSION {
        return Err(format!(
            "Rocket state database version {version} is newer than this app supports"
        ));
    }
    if version < 1 {
        tx.execute_batch("CREATE TABLE sessions(
            id TEXT PRIMARY KEY, workspace TEXT NOT NULL, payload TEXT NOT NULL,
            updated_at INTEGER NOT NULL);
          CREATE INDEX sessions_workspace ON sessions(workspace, updated_at);
          CREATE TABLE checkpoints(
            id INTEGER PRIMARY KEY, workspace TEXT NOT NULL, session_id TEXT,
            label TEXT NOT NULL, kind TEXT NOT NULL, created_at INTEGER NOT NULL);
          CREATE INDEX checkpoints_workspace ON checkpoints(workspace, created_at DESC);
          CREATE TABLE blobs(hash TEXT PRIMARY KEY, size INTEGER NOT NULL, refs INTEGER NOT NULL CHECK(refs >= 0));
          CREATE TABLE checkpoint_files(
            checkpoint_id INTEGER NOT NULL REFERENCES checkpoints(id) ON DELETE CASCADE,
            path TEXT NOT NULL, hash TEXT REFERENCES blobs(hash), mode INTEGER NOT NULL,
            PRIMARY KEY(checkpoint_id,path));
          UPDATE schema_meta SET version=1;") .map_err(db_error)?;
    }
    tx.commit().map_err(db_error)
}

fn validate_id(id: &str) -> Result<(), String> {
    if id.is_empty()
        || id.len() > 128
        || !id
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || b"-_".contains(&c))
    {
        Err("Session ID must be 1-128 ASCII letters, digits, '-' or '_'".into())
    } else {
        Ok(())
    }
}

fn validate_session(tab: &StoredSession, workspace: &Path) -> Result<String, String> {
    validate_id(&tab.id)?;
    if tab.title.trim().is_empty() || tab.title.len() > 512 {
        return Err("Session title must be 1-512 bytes".into());
    }
    if tab.backend.is_empty() || tab.backend.len() > 64 {
        return Err("Session backend is invalid".into());
    }
    if tab.queue.len() > 100 || tab.queue.iter().any(|q| q.len() > 64 * 1024) {
        return Err("Session queue exceeds storage limits".into());
    }
    if !tab.state.is_object() {
        return Err("Session state must be an object".into());
    }
    let supplied = fs::canonicalize(&tab.workspace)
        .map_err(|e| format!("Could not resolve session workspace: {e}"))?;
    if supplied != workspace {
        return Err("Session payload workspace does not match the active workspace".into());
    }
    let payload = serde_json::to_string(tab).map_err(|e| e.to_string())?;
    if payload.len() > MAX_SESSION_BYTES {
        return Err("Session payload exceeds the 4 MiB limit".into());
    }
    Ok(payload)
}

#[tauri::command]
pub fn agent_load_sessions(
    app: AppHandle,
    policy: tauri::State<WorkspacePolicy>,
    workspace: String,
) -> Result<Vec<StoredSession>, String> {
    let root = policy.require_root(Path::new(&workspace))?;
    let key = root.to_string_lossy();
    let conn = open(&rocket_dir(&app)?)?;
    let mut statement = conn
        .prepare("SELECT payload FROM sessions WHERE workspace=? ORDER BY updated_at,id")
        .map_err(db_error)?;
    let rows = statement
        .query_map([key.as_ref()], |row| row.get::<_, String>(0))
        .map_err(db_error)?;
    let mut result = Vec::new();
    for row in rows {
        let raw = row.map_err(db_error)?;
        if raw.len() > MAX_SESSION_BYTES {
            return Err("Stored session payload exceeds the 4 MiB limit; delete or repair ~/.rocket/state.sqlite3".into());
        }
        let tab: StoredSession = serde_json::from_str(&raw).map_err(|e| {
            format!("A stored session is corrupted: {e}. Repair or remove ~/.rocket/state.sqlite3")
        })?;
        validate_session(&tab, &root)?;
        result.push(tab);
    }
    Ok(result)
}

#[tauri::command]
pub fn agent_persist_session(
    app: AppHandle,
    policy: tauri::State<WorkspacePolicy>,
    tab: StoredSession,
) -> Result<(), String> {
    let root = policy.root()?;
    let payload = validate_session(&tab, &root)?;
    let conn = open(&rocket_dir(&app)?)?;
    let tx = conn.unchecked_transaction().map_err(db_error)?;
    tx.execute("INSERT INTO sessions(id,workspace,payload,updated_at) VALUES(?,?,?,?)
        ON CONFLICT(id) DO UPDATE SET workspace=excluded.workspace,payload=excluded.payload,updated_at=excluded.updated_at",
        params![tab.id, root.to_string_lossy(), payload, now()]).map_err(db_error)?;
    tx.commit().map_err(db_error)
}

#[tauri::command]
pub fn agent_delete_session(app: AppHandle, session_id: String) -> Result<(), String> {
    validate_id(&session_id)?;
    let dir = rocket_dir(&app)?;
    let conn = open(&dir)?;
    let tx = conn.unchecked_transaction().map_err(db_error)?;
    delete_checkpoints(&tx, "session_id", &session_id)?;
    tx.execute("DELETE FROM sessions WHERE id=?", [session_id])
        .map_err(db_error)?;
    tx.commit().map_err(db_error)?;
    gc(&conn, &dir)
}

#[tauri::command]
pub fn agent_create_checkpoint(
    app: AppHandle,
    policy: tauri::State<WorkspacePolicy>,
    session_id: Option<String>,
    label: Option<String>,
) -> Result<CheckpointSummary, String> {
    if let Some(id) = &session_id {
        validate_id(id)?;
    }
    let label = label.unwrap_or_else(|| "Safe point".into());
    if label.trim().is_empty() || label.len() > 256 {
        return Err("Checkpoint label must be 1-256 bytes".into());
    }
    create_checkpoint_at(
        &rocket_dir(&app)?,
        &policy.root()?,
        session_id.as_deref(),
        &label,
        "manual",
    )
}

pub fn create_checkpoint_at(
    dir: &Path,
    workspace: &Path,
    session_id: Option<&str>,
    label: &str,
    kind: &str,
) -> Result<CheckpointSummary, String> {
    let root = fs::canonicalize(workspace)
        .map_err(|e| format!("Could not resolve checkpoint workspace: {e}"))?;
    let files = snapshot(&root)?;
    let conn = open(dir)?;
    let tx = conn.unchecked_transaction().map_err(db_error)?;
    tx.execute(
        "INSERT INTO checkpoints(workspace,session_id,label,kind,created_at) VALUES(?,?,?,?,?)",
        params![root.to_string_lossy(), session_id, label, kind, now()],
    )
    .map_err(db_error)?;
    let id = tx.last_insert_rowid();
    for (path, file) in &files {
        let hash = hex_hash(&file.bytes);
        write_blob(dir, &hash, &file.bytes)?;
        tx.execute("INSERT INTO blobs(hash,size,refs) VALUES(?,?,1) ON CONFLICT(hash) DO UPDATE SET refs=refs+1",
            params![hash, file.bytes.len() as i64]).map_err(db_error)?;
        tx.execute(
            "INSERT INTO checkpoint_files(checkpoint_id,path,hash,mode) VALUES(?,?,?,?)",
            params![id, path, hash, file.mode],
        )
        .map_err(db_error)?;
    }
    tx.commit().map_err(db_error)?;
    Ok(CheckpointSummary {
        id,
        session_id: session_id.map(str::to_owned),
        label: label.into(),
        kind: kind.into(),
        created_at: now(),
        file_count: files.len() as i64,
    })
}

#[tauri::command]
pub fn agent_list_checkpoints(
    app: AppHandle,
    policy: tauri::State<WorkspacePolicy>,
) -> Result<Vec<CheckpointSummary>, String> {
    let root = policy.root()?;
    let conn = open(&rocket_dir(&app)?)?;
    let mut stmt = conn.prepare("SELECT c.id,c.session_id,c.label,c.kind,c.created_at,count(f.path) FROM checkpoints c LEFT JOIN checkpoint_files f ON f.checkpoint_id=c.id WHERE c.workspace=? GROUP BY c.id ORDER BY c.created_at DESC,c.id DESC LIMIT 100").map_err(db_error)?;
    let rows = stmt
        .query_map([root.to_string_lossy().as_ref()], |r| {
            Ok(CheckpointSummary {
                id: r.get(0)?,
                session_id: r.get(1)?,
                label: r.get(2)?,
                kind: r.get(3)?,
                created_at: r.get(4)?,
                file_count: r.get(5)?,
            })
        })
        .map_err(db_error)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(db_error)
}

#[tauri::command]
pub fn agent_restore_checkpoint(
    app: AppHandle,
    policy: tauri::State<WorkspacePolicy>,
    checkpoint_id: i64,
    force: Option<bool>,
) -> Result<RestoreResult, String> {
    let root = policy.root()?;
    restore_at(
        &rocket_dir(&app)?,
        &root,
        checkpoint_id,
        force.unwrap_or(false),
    )
}

fn restore_at(dir: &Path, root: &Path, id: i64, force: bool) -> Result<RestoreResult, String> {
    let root = fs::canonicalize(root).map_err(|e| e.to_string())?;
    let conn = open(dir)?;
    let workspace: Option<String> = conn
        .query_row("SELECT workspace FROM checkpoints WHERE id=?", [id], |r| {
            r.get(0)
        })
        .optional()
        .map_err(db_error)?;
    let workspace = workspace.ok_or("Checkpoint no longer exists")?;
    if root != PathBuf::from(&workspace) {
        return Err("Checkpoint belongs to a different workspace".into());
    }
    let target = checkpoint_map(&conn, id)?;
    let current = snapshot(&root)?;
    let latest_id: i64 = conn
        .query_row(
            "SELECT id FROM checkpoints WHERE workspace=? AND id>=? ORDER BY id DESC LIMIT 1",
            params![workspace, id],
            |r| r.get(0),
        )
        .map_err(db_error)?;
    let expected = checkpoint_map(&conn, latest_id)?;
    let paths: BTreeSet<_> = target.keys().chain(expected.keys()).cloned().collect();
    let conflicts: Vec<_> = paths
        .iter()
        .filter(|p| {
            current.get(*p).map(|f| hex_hash(&f.bytes)) != expected.get(*p).map(|f| f.0.clone())
        })
        .cloned()
        .collect();
    if !force && !conflicts.is_empty() {
        return Err(format!("Checkpoint restore conflicts with current bytes for: {}. Confirm restore to overwrite these paths.", conflicts.join(", ")));
    }
    for path in &paths {
        let full = guarded(&root, path)?;
        if let Some((hash, mode)) = target.get(path) {
            let bytes = read_blob(dir, hash)?;
            atomic_write(&full, &bytes, *mode)?;
        } else if full.exists() {
            let meta = fs::symlink_metadata(&full).map_err(|e| e.to_string())?;
            if !meta.file_type().is_file() {
                return Err(format!(
                    "Refusing to delete non-regular checkpoint path {path}"
                ));
            }
            fs::remove_file(&full).map_err(|e| format!("Could not delete {path}: {e}"))?;
        }
    }
    Ok(RestoreResult {
        paths: paths.into_iter().collect(),
    })
}

#[tauri::command]
pub fn agent_delete_checkpoint(
    app: AppHandle,
    policy: tauri::State<WorkspacePolicy>,
    checkpoint_id: i64,
) -> Result<(), String> {
    let dir = rocket_dir(&app)?;
    let conn = open(&dir)?;
    let workspace: Option<String> = conn
        .query_row(
            "SELECT workspace FROM checkpoints WHERE id=?",
            [checkpoint_id],
            |r| r.get(0),
        )
        .optional()
        .map_err(db_error)?;
    if workspace.as_deref() != Some(policy.root()?.to_string_lossy().as_ref()) {
        return Err("Checkpoint does not exist in the active workspace".into());
    }
    let tx = conn.unchecked_transaction().map_err(db_error)?;
    delete_checkpoints(&tx, "id", &checkpoint_id)?;
    tx.commit().map_err(db_error)?;
    gc(&conn, &dir)
}

fn delete_checkpoints(
    tx: &Transaction<'_>,
    column: &str,
    value: &dyn rusqlite::ToSql,
) -> Result<(), String> {
    if !matches!(column, "id" | "session_id") {
        return Err("Invalid checkpoint deletion selector".into());
    }
    let sql = format!("SELECT hash,count(*) FROM checkpoint_files WHERE checkpoint_id IN (SELECT id FROM checkpoints WHERE {column}=?) GROUP BY hash");
    let mut stmt = tx.prepare(&sql).map_err(db_error)?;
    let refs = stmt
        .query_map([value], |r| {
            Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?))
        })
        .map_err(db_error)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(db_error)?;
    drop(stmt);
    for (hash, count) in refs {
        tx.execute(
            "UPDATE blobs SET refs=refs-? WHERE hash=?",
            params![count, hash],
        )
        .map_err(db_error)?;
    }
    tx.execute(
        &format!("DELETE FROM checkpoints WHERE {column}=?"),
        [value],
    )
    .map_err(db_error)?;
    Ok(())
}

#[derive(Clone)]
struct SnapFile {
    bytes: Vec<u8>,
    mode: i64,
}
fn snapshot(root: &Path) -> Result<BTreeMap<String, SnapFile>, String> {
    let mut out = BTreeMap::new();
    let mut total = 0;
    walk(root, root, &mut out, &mut total)?;
    Ok(out)
}
fn walk(
    root: &Path,
    dir: &Path,
    out: &mut BTreeMap<String, SnapFile>,
    total: &mut u64,
) -> Result<(), String> {
    let mut entries = fs::read_dir(dir)
        .map_err(|e| format!("Could not read {}: {e}", dir.display()))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    entries.sort_by_key(|e| e.file_name());
    for entry in entries {
        let name = entry.file_name();
        let text = name.to_string_lossy();
        if SKIP_DIRS.contains(&text.as_ref()) {
            continue;
        }
        let meta = fs::symlink_metadata(entry.path()).map_err(|e| e.to_string())?;
        if meta.file_type().is_symlink() {
            return Err(format!(
                "Checkpoint cannot include symlink {}",
                entry.path().display()
            ));
        }
        if meta.is_dir() {
            walk(root, &entry.path(), out, total)?
        } else if meta.is_file() {
            if out.len() >= MAX_FILES {
                return Err(format!("Checkpoint exceeds {MAX_FILES} regular files"));
            }
            let mut bytes = Vec::with_capacity(meta.len().min(MAX_FILE_BYTES) as usize);
            File::open(entry.path())
                .and_then(|f| f.take(MAX_FILE_BYTES + 1).read_to_end(&mut bytes))
                .map_err(|e| e.to_string())?;
            if bytes.len() as u64 > MAX_FILE_BYTES {
                return Err(format!(
                    "Checkpoint file {} exceeds 16 MiB",
                    entry.path().display()
                ));
            }
            *total += bytes.len() as u64;
            if *total > MAX_SNAPSHOT_BYTES {
                return Err("Checkpoint exceeds the 128 MiB workspace limit".into());
            }
            #[cfg(unix)]
            let mode = {
                use std::os::unix::fs::PermissionsExt;
                meta.permissions().mode() as i64
            };
            #[cfg(not(unix))]
            let mode = 0;
            let rel = entry
                .path()
                .strip_prefix(root)
                .unwrap()
                .to_string_lossy()
                .replace('\\', "/");
            out.insert(rel, SnapFile { bytes, mode });
        } else {
            return Err(format!(
                "Checkpoint supports regular files only: {}",
                entry.path().display()
            ));
        }
    }
    Ok(())
}
fn checkpoint_map(conn: &Connection, id: i64) -> Result<BTreeMap<String, (String, i64)>, String> {
    let mut s = conn
        .prepare("SELECT path,hash,mode FROM checkpoint_files WHERE checkpoint_id=? ORDER BY path")
        .map_err(db_error)?;
    let result = s
        .query_map([id], |r| {
            Ok((r.get::<_, String>(0)?, (r.get(1)?, r.get(2)?)))
        })
        .map_err(db_error)?
        .collect::<Result<_, _>>()
        .map_err(db_error);
    result
}
fn guarded(root: &Path, rel: &str) -> Result<PathBuf, String> {
    let p = Path::new(rel);
    if p.is_absolute() || p.components().any(|c| !matches!(c, Component::Normal(_))) {
        return Err("Checkpoint contains an unsafe path".into());
    }
    let full = root.join(p);
    let mut parent = full.parent().ok_or("Unsafe checkpoint path")?;
    while !parent.exists() {
        parent = parent.parent().ok_or("Unsafe checkpoint path")?
    }
    if !fs::canonicalize(parent)
        .map_err(|e| e.to_string())?
        .starts_with(root)
    {
        return Err("Checkpoint path escapes workspace".into());
    }
    Ok(full)
}
fn atomic_write(path: &Path, bytes: &[u8], mode: i64) -> Result<(), String> {
    fs::create_dir_all(path.parent().ok_or("Path has no parent")?).map_err(|e| e.to_string())?;
    if path.exists()
        && fs::symlink_metadata(path)
            .map_err(|e| e.to_string())?
            .file_type()
            .is_symlink()
    {
        return Err("Refusing to replace a symlink".into());
    }
    let temp = path.with_file_name(format!(".rocket-restore-{}-{}", std::process::id(), now()));
    let mut f = OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(&temp)
        .map_err(|e| e.to_string())?;
    f.write_all(bytes)
        .and_then(|_| f.sync_all())
        .map_err(|e| e.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&temp, fs::Permissions::from_mode(mode as u32))
            .map_err(|e| e.to_string())?
    }
    fs::rename(&temp, path).map_err(|e| e.to_string())
}
fn write_blob(dir: &Path, hash: &str, bytes: &[u8]) -> Result<(), String> {
    let path = dir.join("checkpoints").join(hash);
    if path.exists() {
        return Ok(());
    }
    let tmp = path.with_extension(format!("tmp-{}", std::process::id()));
    match OpenOptions::new().create_new(true).write(true).open(&tmp) {
        Ok(mut f) => {
            f.write_all(bytes)
                .and_then(|_| f.sync_all())
                .map_err(|e| e.to_string())?;
            private_file(&tmp)?;
            match fs::rename(&tmp, &path) {
                Ok(()) => Ok(()),
                Err(_) if path.exists() => {
                    let _ = fs::remove_file(tmp);
                    Ok(())
                }
                Err(e) => Err(e.to_string()),
            }
        }
        Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}
fn read_blob(dir: &Path, hash: &str) -> Result<Vec<u8>, String> {
    let bytes = fs::read(dir.join("checkpoints").join(hash))
        .map_err(|e| format!("Checkpoint blob {hash} is unavailable: {e}"))?;
    if hex_hash(&bytes) != hash {
        return Err(format!(
            "Checkpoint blob {hash} failed integrity verification"
        ));
    }
    Ok(bytes)
}
fn gc(conn: &Connection, dir: &Path) -> Result<(), String> {
    let hashes = conn
        .prepare("SELECT hash FROM blobs WHERE refs=0")
        .and_then(|mut s| {
            s.query_map([], |r| r.get::<_, String>(0))?
                .collect::<Result<Vec<_>, _>>()
        })
        .map_err(db_error)?;
    for hash in &hashes {
        match fs::remove_file(dir.join("checkpoints").join(hash)) {
            Ok(()) => {}
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
            Err(e) => {
                return Err(format!(
                    "Checkpoint was deleted, but blob garbage collection failed: {e}"
                ))
            }
        }
    }
    for hash in hashes {
        conn.execute("DELETE FROM blobs WHERE hash=? AND refs=0", [hash])
            .map_err(db_error)?;
    }
    Ok(())
}
fn hex_hash(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}
fn now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}
fn db_error(e: rusqlite::Error) -> String {
    format!("Rocket state database error: {e}")
}
#[cfg(unix)]
fn private_dir(p: &Path) -> Result<(), String> {
    use std::os::unix::fs::PermissionsExt;
    fs::set_permissions(p, fs::Permissions::from_mode(0o700)).map_err(|e| e.to_string())
}
#[cfg(not(unix))]
fn private_dir(_: &Path) -> Result<(), String> {
    Ok(())
}
#[cfg(unix)]
fn private_file(p: &Path) -> Result<(), String> {
    use std::os::unix::fs::PermissionsExt;
    fs::set_permissions(p, fs::Permissions::from_mode(0o600)).map_err(|e| e.to_string())
}
#[cfg(not(unix))]
fn private_file(_: &Path) -> Result<(), String> {
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};

    static NEXT_TEMP: AtomicU64 = AtomicU64::new(0);

    fn setup() -> (PathBuf, PathBuf) {
        let id = NEXT_TEMP.fetch_add(1, Ordering::Relaxed);
        let root = std::env::temp_dir().join(format!("rocket-store-{}-{id}", std::process::id()));
        let state = root.join("state");
        let workspace = root.join("workspace");
        fs::create_dir_all(state.join("checkpoints")).unwrap();
        fs::create_dir_all(&workspace).unwrap();
        (state, workspace)
    }

    #[test]
    fn migrates_idempotently() {
        let (state, workspace) = setup();
        let first = open(&state).unwrap();
        let version: i64 = first
            .query_row("SELECT version FROM schema_meta", [], |row| row.get(0))
            .unwrap();
        assert_eq!(version, SCHEMA_VERSION);
        drop(first);
        open(&state).unwrap();
        fs::remove_dir_all(workspace.parent().unwrap()).unwrap();
    }

    #[test]
    fn checkpoints_deduplicate_and_restore_dirty_state() {
        let (state, workspace) = setup();
        fs::write(workspace.join("dirty.txt"), b"initial dirty").unwrap();
        let before =
            create_checkpoint_at(&state, &workspace, Some("session-1"), "before", "automatic")
                .unwrap();
        fs::write(workspace.join("dirty.txt"), b"agent edit").unwrap();
        fs::write(workspace.join("created.txt"), b"created").unwrap();
        create_checkpoint_at(&state, &workspace, Some("session-1"), "after", "turn-state").unwrap();

        let conn = open(&state).unwrap();
        let blobs: i64 = conn
            .query_row("SELECT count(*) FROM blobs", [], |row| row.get(0))
            .unwrap();
        let references: i64 = conn
            .query_row("SELECT sum(refs) FROM blobs", [], |row| row.get(0))
            .unwrap();
        assert_eq!(blobs, 3);
        assert_eq!(references, 3);
        drop(conn);

        let restored = restore_at(&state, &workspace, before.id, false).unwrap();
        assert!(restored.paths.contains(&"dirty.txt".to_string()));
        assert_eq!(
            fs::read(workspace.join("dirty.txt")).unwrap(),
            b"initial dirty"
        );
        assert!(!workspace.join("created.txt").exists());
        fs::remove_dir_all(workspace.parent().unwrap()).unwrap();
    }

    #[test]
    fn restore_requires_force_after_external_change() {
        let (state, workspace) = setup();
        fs::write(workspace.join("file.txt"), b"before").unwrap();
        let before = create_checkpoint_at(&state, &workspace, None, "before", "manual").unwrap();
        fs::write(workspace.join("file.txt"), b"after").unwrap();
        create_checkpoint_at(&state, &workspace, None, "after", "turn-state").unwrap();
        fs::write(workspace.join("file.txt"), b"external").unwrap();

        assert!(restore_at(&state, &workspace, before.id, false)
            .unwrap_err()
            .contains("conflicts"));
        restore_at(&state, &workspace, before.id, true).unwrap();
        assert_eq!(fs::read(workspace.join("file.txt")).unwrap(), b"before");
        fs::remove_dir_all(workspace.parent().unwrap()).unwrap();
    }

    #[test]
    fn deleting_checkpoints_garbage_collects_unreferenced_blobs() {
        let (state, workspace) = setup();
        fs::write(workspace.join("file.txt"), b"shared").unwrap();
        let first =
            create_checkpoint_at(&state, &workspace, Some("session-1"), "one", "manual").unwrap();
        let second =
            create_checkpoint_at(&state, &workspace, Some("session-1"), "two", "manual").unwrap();
        let conn = open(&state).unwrap();
        let tx = conn.unchecked_transaction().unwrap();
        delete_checkpoints(&tx, "id", &first.id).unwrap();
        tx.commit().unwrap();
        gc(&conn, &state).unwrap();
        assert_eq!(
            conn.query_row("SELECT refs FROM blobs", [], |row| row.get::<_, i64>(0))
                .unwrap(),
            1
        );
        let tx = conn.unchecked_transaction().unwrap();
        delete_checkpoints(&tx, "id", &second.id).unwrap();
        tx.commit().unwrap();
        gc(&conn, &state).unwrap();
        assert_eq!(
            conn.query_row("SELECT count(*) FROM blobs", [], |row| row.get::<_, i64>(0))
                .unwrap(),
            0
        );
        fs::remove_dir_all(workspace.parent().unwrap()).unwrap();
    }
}
