use gix::bstr::ByteSlice;
use serde::Serialize;
use std::collections::BTreeMap;
use std::path::{Component, Path, PathBuf};
use std::process::Command;

use crate::workspace::WorkspacePolicy;

#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitFileStatus {
    pub index_status: String,
    pub path: String,
    pub working_tree_status: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitCommit {
    pub author: String,
    pub date: String,
    pub hash: String,
    pub message: String,
    pub parents: Vec<String>,
    pub refs: Vec<String>,
    pub short_hash: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitSnapshot {
    pub ahead: usize,
    pub behind: usize,
    pub branch: String,
    pub commits: Vec<GitCommit>,
    pub files: Vec<GitFileStatus>,
    pub is_repository: bool,
}

fn git(workspace: &str, args: &[&str]) -> Result<Vec<u8>, String> {
    let output = Command::new("git")
        .arg("-C")
        .arg(workspace)
        .args(args)
        .output()
        .map_err(|error| error.to_string())?;
    if output.status.success() {
        Ok(output.stdout)
    } else {
        Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
    }
}

fn guarded_workspace(policy: &WorkspacePolicy, workspace: &str) -> Result<String, String> {
    let workspace = policy.require_root(Path::new(workspace))?;
    let repo = gix::discover(&workspace).map_err(|_| "Workspace is not a Git repository")?;
    let repository_root = repo
        .workdir()
        .ok_or("Bare Git repositories are not supported")?
        .canonicalize()
        .map_err(|error| error.to_string())?;
    if repository_root != workspace {
        return Err("Git repository root must match the active workspace".to_string());
    }
    Ok(workspace.to_string_lossy().into_owned())
}

fn guarded_git_path(path: &str) -> Result<String, String> {
    let relative = Path::new(path);
    if path.trim().is_empty()
        || relative.is_absolute()
        || relative
            .components()
            .any(|part| matches!(part, Component::ParentDir | Component::RootDir | Component::Prefix(_)))
    {
        return Err("Git path must be relative to the active workspace".to_string());
    }
    Ok(relative.to_string_lossy().into_owned())
}

fn commit_message(message: &str) -> Result<&str, String> {
    let message = message.trim();
    if message.is_empty() {
        Err("Commit message required".to_string())
    } else {
        Ok(message)
    }
}

fn short_ref(name: &gix::refs::FullNameRef) -> String {
    let name = name.as_bstr().to_str_lossy();
    name.strip_prefix("refs/heads/")
        .or_else(|| name.strip_prefix("refs/remotes/"))
        .or_else(|| name.strip_prefix("refs/tags/"))
        .unwrap_or(&name)
        .to_string()
}

fn index_status(change: &gix::diff::index::Change) -> &'static str {
    match change {
        gix::diff::index::Change::Addition { .. } => "A",
        gix::diff::index::Change::Deletion { .. } => "D",
        gix::diff::index::Change::Modification { .. } => "M",
        gix::diff::index::Change::Rewrite { copy, .. } => {
            if *copy {
                "C"
            } else {
                "R"
            }
        }
    }
}

fn worktree_status(change: &gix::status::index_worktree::Item) -> &'static str {
    use gix::status::index_worktree::iter::Summary;

    match change.summary() {
        Some(Summary::Added) => "?",
        Some(Summary::Removed) => "D",
        Some(Summary::Modified) | Some(Summary::TypeChange) => "M",
        Some(Summary::Renamed) => "R",
        Some(Summary::Copied) => "C",
        Some(Summary::IntentToAdd) => "A",
        Some(Summary::Conflict) => "U",
        None => " ",
    }
}

fn collect_status(repo: &gix::Repository) -> Result<Vec<GitFileStatus>, String> {
    let mut files: BTreeMap<String, GitFileStatus> = BTreeMap::new();
    let platform = repo
        .status(gix::progress::Discard)
        .map_err(|error| error.to_string())?
        .untracked_files(gix::status::UntrackedFiles::Files);
    let items = platform
        .into_iter(Vec::new())
        .map_err(|error| error.to_string())?;

    for item in items {
        let item = item.map_err(|error| error.to_string())?;
        let path = item.location().to_str_lossy().into_owned();
        let entry = files.entry(path.clone()).or_insert_with(|| GitFileStatus {
            index_status: " ".to_string(),
            path,
            working_tree_status: " ".to_string(),
        });
        match item {
            gix::status::Item::IndexWorktree(change) => {
                entry.working_tree_status = worktree_status(&change).to_string();
            }
            gix::status::Item::TreeIndex(change) => {
                entry.index_status = index_status(&change).to_string();
            }
        }
    }

    Ok(files.into_values().collect())
}

fn collect_refs(repo: &gix::Repository) -> Result<BTreeMap<String, Vec<String>>, String> {
    let mut refs = BTreeMap::<String, Vec<String>>::new();
    let platform = repo.references().map_err(|error| error.to_string())?;
    let iter = platform.all().map_err(|error| error.to_string())?;

    for reference in iter {
        let mut reference = match reference {
            Ok(reference) => reference,
            Err(_) => continue,
        };
        let id = match reference.peel_to_id() {
            Ok(id) => id.to_string(),
            Err(_) => continue,
        };
        let label = short_ref(reference.name());
        if label.ends_with("/HEAD") {
            continue;
        }
        refs.entry(id).or_default().push(label);
    }
    Ok(refs)
}

fn collect_commits(
    repo: &gix::Repository,
    branch: &str,
    references: &BTreeMap<String, Vec<String>>,
) -> Result<Vec<GitCommit>, String> {
    let head = match repo.head_commit() {
        Ok(head) => head,
        Err(_) => return Ok(Vec::new()),
    };
    let walk = repo
        .rev_walk([head.id])
        .sorting(gix::revision::walk::Sorting::ByCommitTime(
            gix::traverse::commit::simple::CommitTimeOrder::NewestFirst,
        ))
        .all()
        .map_err(|error| error.to_string())?;
    let mut commits = Vec::new();

    for info in walk.take(100) {
        let info = info.map_err(|error| error.to_string())?;
        let commit = info.object().map_err(|error| error.to_string())?;
        let hash = info.id.to_string();
        let short_hash = info.id().shorten_or_id().to_string();
        let author = commit
            .author()
            .map(|author| author.name.to_str_lossy().into_owned())
            .unwrap_or_else(|_| "Unknown".to_string());
        let date = commit
            .time()
            .map(|time| time.format_or_unix(gix::date::time::format::ISO8601_STRICT))
            .unwrap_or_default();
        let message = commit
            .message_raw_sloppy()
            .lines()
            .next()
            .unwrap_or_default()
            .to_str_lossy()
            .into_owned();
        let mut refs = references.get(&hash).cloned().unwrap_or_default();
        if info.id == head.id && !branch.is_empty() {
            refs.retain(|name| name != branch);
            refs.insert(0, format!("HEAD -> {branch}"));
        }
        commits.push(GitCommit {
            author,
            date,
            hash,
            message,
            parents: info.parent_ids().map(|id| id.to_string()).collect(),
            refs,
            short_hash,
        });
    }

    Ok(commits)
}

#[tauri::command]
pub fn git_snapshot(
    policy: tauri::State<WorkspacePolicy>,
    workspace: String,
) -> Result<GitSnapshot, String> {
    let workspace = policy
        .require_root(Path::new(&workspace))?
        .to_string_lossy()
        .into_owned();
    let repo = match gix::discover(&workspace) {
        Ok(repo) => repo,
        Err(_) => {
            return Ok(GitSnapshot {
                ahead: 0,
                behind: 0,
                branch: String::new(),
                commits: Vec::new(),
                files: Vec::new(),
                is_repository: false,
            })
        }
    };
    let repository_root = repo
        .workdir()
        .and_then(|path| path.canonicalize().ok());
    if repository_root.as_ref() != Some(&PathBuf::from(&workspace)) {
        return Ok(GitSnapshot {
            ahead: 0,
            behind: 0,
            branch: String::new(),
            commits: Vec::new(),
            files: Vec::new(),
            is_repository: false,
        });
    }
    let branch = repo
        .head_name()
        .map_err(|error| error.to_string())?
        .map(|name| short_ref(name.as_ref()))
        .unwrap_or_else(|| "HEAD".to_string());
    let files = collect_status(&repo)?;
    let references = collect_refs(&repo)?;
    let commits = collect_commits(&repo, &branch, &references)?;

    Ok(GitSnapshot {
        ahead: 0,
        behind: 0,
        branch,
        commits,
        files,
        is_repository: true,
    })
}

#[tauri::command]
pub fn git_stage(
    policy: tauri::State<WorkspacePolicy>,
    workspace: String,
    paths: Vec<String>,
) -> Result<(), String> {
    let workspace = guarded_workspace(&policy, &workspace)?;
    let paths = paths
        .iter()
        .map(|path| guarded_git_path(path))
        .collect::<Result<Vec<_>, _>>()?;
    let mut args = vec!["add", "--"];
    args.extend(paths.iter().map(String::as_str));
    git(&workspace, &args).map(|_| ())
}

#[tauri::command]
pub fn git_unstage(
    policy: tauri::State<WorkspacePolicy>,
    workspace: String,
    paths: Vec<String>,
) -> Result<(), String> {
    let workspace = guarded_workspace(&policy, &workspace)?;
    let paths = paths
        .iter()
        .map(|path| guarded_git_path(path))
        .collect::<Result<Vec<_>, _>>()?;
    let mut args = vec!["restore", "--staged", "--"];
    args.extend(paths.iter().map(String::as_str));
    git(&workspace, &args).map(|_| ())
}

#[tauri::command]
pub fn git_commit(
    policy: tauri::State<WorkspacePolicy>,
    workspace: String,
    message: String,
) -> Result<(), String> {
    let workspace = guarded_workspace(&policy, &workspace)?;
    git(&workspace, &["commit", "-m", commit_message(&message)?]).map(|_| ())
}

#[tauri::command]
pub fn git_diff(
    policy: tauri::State<WorkspacePolicy>,
    workspace: String,
    path: String,
    cached: bool,
) -> Result<String, String> {
    let workspace = guarded_workspace(&policy, &workspace)?;
    let path = guarded_git_path(&path)?;
    let args = if cached {
        vec!["diff", "--cached", "--", path.as_str()]
    } else {
        vec!["diff", "--", path.as_str()]
    };
    let patch = git(&workspace, &args)?;
    if !patch.is_empty() {
        return Ok(String::from_utf8_lossy(&patch).into_owned());
    }

    let absolute = Path::new(&workspace).join(&path);
    if absolute.exists() {
        let absolute = policy.existing_path(&absolute)?;
        if !absolute.is_file() {
            return Ok(String::new());
        }
        let output = Command::new("git")
            .arg("-C")
            .arg(&workspace)
            .args(["diff", "--no-index", "--", "/dev/null"])
            .arg(&absolute)
            .output()
            .map_err(|error| error.to_string())?;
        if output.status.success() || output.status.code() == Some(1) {
            return Ok(String::from_utf8_lossy(&output.stdout).into_owned());
        }
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }

    Ok(String::new())
}

#[tauri::command]
pub fn git_show(
    policy: tauri::State<WorkspacePolicy>,
    workspace: String,
    hash: String,
) -> Result<String, String> {
    let workspace = guarded_workspace(&policy, &workspace)?;
    if hash.len() < 7 || !hash.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err("Invalid commit hash".to_string());
    }
    git(
        &workspace,
        &[
            "show",
            "--format=",
            "--patch",
            "--find-renames",
            &hash,
            "--",
        ],
    )
    .map(|patch| String::from_utf8_lossy(&patch).into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn shortens_common_reference_names() {
        let name = gix::refs::FullName::try_from("refs/heads/feature/agent").unwrap();
        assert_eq!(short_ref(name.as_ref()), "feature/agent");
    }

    #[test]
    fn rejects_empty_commit_messages() {
        assert_eq!(
            commit_message("  ").unwrap_err(),
            "Commit message required"
        );
    }

    #[test]
    fn accepts_deleted_paths_without_existing_parents() {
        assert_eq!(
            guarded_git_path("deleted-dir/tracked-file.ts").unwrap(),
            "deleted-dir/tracked-file.ts"
        );
        assert!(guarded_git_path("../outside.ts").is_err());
        assert!(guarded_git_path("/outside.ts").is_err());
    }
}
