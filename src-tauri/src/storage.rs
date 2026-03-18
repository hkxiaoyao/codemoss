use std::collections::HashMap;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::thread;
use std::time::{Duration, Instant};

use crate::types::{AppSettings, WorkspaceEntry};
use uuid::Uuid;

const STORAGE_LOCK_WAIT_TIMEOUT: Duration = Duration::from_secs(5);
const STORAGE_LOCK_RETRY_INTERVAL: Duration = Duration::from_millis(25);
const STORAGE_LOCK_STALE_TIMEOUT: Duration = Duration::from_secs(30);

struct StorageFileLock {
    path: PathBuf,
}

impl Drop for StorageFileLock {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.path);
    }
}

fn lock_file_path(path: &Path) -> PathBuf {
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| format!("{value}.lock"))
        .unwrap_or_else(|| "lock".to_string());
    path.with_extension(extension)
}

fn is_lock_file_stale(lock_path: &Path) -> bool {
    let metadata = match std::fs::metadata(lock_path) {
        Ok(metadata) => metadata,
        Err(_) => return false,
    };
    let modified_at = match metadata.modified() {
        Ok(modified_at) => modified_at,
        Err(_) => return false,
    };
    match modified_at.elapsed() {
        Ok(elapsed) => elapsed > STORAGE_LOCK_STALE_TIMEOUT,
        Err(_) => false,
    }
}

fn acquire_storage_lock(path: &Path) -> Result<StorageFileLock, String> {
    let lock_path = lock_file_path(path);
    if let Some(parent) = lock_path.parent() {
        std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }

    let deadline = Instant::now() + STORAGE_LOCK_WAIT_TIMEOUT;
    loop {
        match std::fs::OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(&lock_path)
        {
            Ok(mut file) => {
                let _ = writeln!(file, "pid={}", std::process::id());
                return Ok(StorageFileLock { path: lock_path });
            }
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
                if is_lock_file_stale(&lock_path) {
                    let _ = std::fs::remove_file(&lock_path);
                    continue;
                }
                if Instant::now() >= deadline {
                    return Err(format!(
                        "Timed out waiting for storage file lock: {}",
                        lock_path.display()
                    ));
                }
                thread::sleep(STORAGE_LOCK_RETRY_INTERVAL);
            }
            Err(error) => return Err(error.to_string()),
        }
    }
}

fn with_storage_lock<T>(path: &Path, op: impl FnOnce() -> Result<T, String>) -> Result<T, String> {
    let _lock_guard = acquire_storage_lock(path)?;
    op()
}

fn write_string_atomically(path: &Path, content: &str) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let parent = path
        .parent()
        .ok_or_else(|| format!("Storage path has no parent: {}", path.display()))?;
    let filename = path
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| format!("Storage path has invalid filename: {}", path.display()))?;
    let temp_path = parent.join(format!(".{filename}.{}.tmp", Uuid::new_v4()));
    let mut temp_file = std::fs::OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(&temp_path)
        .map_err(|error| error.to_string())?;
    temp_file
        .write_all(content.as_bytes())
        .map_err(|error| error.to_string())?;
    temp_file.sync_all().map_err(|error| error.to_string())?;

    #[cfg(target_os = "windows")]
    if path.exists() {
        std::fs::remove_file(path).map_err(|error| error.to_string())?;
    }

    if let Err(error) = std::fs::rename(&temp_path, path) {
        let _ = std::fs::remove_file(&temp_path);
        return Err(error.to_string());
    }
    Ok(())
}

fn read_workspace_list(path: &Path) -> Result<Vec<WorkspaceEntry>, String> {
    if !path.exists() {
        return Ok(Vec::new());
    }
    let data = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
    serde_json::from_str(&data).map_err(|e| e.to_string())
}

fn merge_workspace_entries(
    existing: Vec<WorkspaceEntry>,
    incoming: &[WorkspaceEntry],
) -> Vec<WorkspaceEntry> {
    let mut merged = existing;
    let mut index_by_id = HashMap::new();
    for (index, entry) in merged.iter().enumerate() {
        index_by_id.insert(entry.id.clone(), index);
    }

    for entry in incoming {
        if let Some(index) = index_by_id.get(&entry.id).copied() {
            merged[index] = entry.clone();
        } else {
            index_by_id.insert(entry.id.clone(), merged.len());
            merged.push(entry.clone());
        }
    }
    merged
}

pub(crate) fn read_workspaces(path: &PathBuf) -> Result<HashMap<String, WorkspaceEntry>, String> {
    let list = read_workspace_list(path)?;
    Ok(list
        .into_iter()
        .map(|entry| (entry.id.clone(), entry))
        .collect())
}

pub(crate) fn write_workspaces(path: &PathBuf, entries: &[WorkspaceEntry]) -> Result<(), String> {
    with_storage_lock(path, || {
        let data = serde_json::to_string_pretty(entries).map_err(|e| e.to_string())?;
        write_string_atomically(path, &data)
    })
}

pub(crate) fn write_workspaces_preserving_existing(
    path: &PathBuf,
    entries: &[WorkspaceEntry],
) -> Result<Vec<WorkspaceEntry>, String> {
    with_storage_lock(path, || {
        let existing = read_workspace_list(path)?;
        let merged = merge_workspace_entries(existing, entries);
        let data = serde_json::to_string_pretty(&merged).map_err(|e| e.to_string())?;
        write_string_atomically(path, &data)?;
        Ok(merged)
    })
}

pub(crate) fn read_settings(path: &PathBuf) -> Result<AppSettings, String> {
    if !path.exists() {
        return Ok(AppSettings::default());
    }
    let data = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
    serde_json::from_str(&data).map_err(|e| e.to_string())
}

pub(crate) fn write_settings(path: &PathBuf, settings: &AppSettings) -> Result<(), String> {
    with_storage_lock(path, || {
        let data = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
        write_string_atomically(path, &data)
    })
}

#[cfg(test)]
mod tests {
    use super::{read_workspaces, write_workspaces, write_workspaces_preserving_existing};
    use crate::types::{WorkspaceEntry, WorkspaceKind, WorkspaceSettings};
    use std::sync::{Arc, Barrier};
    use std::thread;
    use uuid::Uuid;

    #[test]
    fn write_read_workspaces_persists_sort_and_group() {
        let temp_dir = std::env::temp_dir().join(format!("moss-x-test-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&temp_dir).expect("create temp dir");
        let path = temp_dir.join("workspaces.json");

        let mut settings = WorkspaceSettings::default();
        settings.sort_order = Some(5);
        settings.group_id = Some("group-42".to_string());
        settings.sidebar_collapsed = true;
        settings.git_root = Some("/tmp".to_string());
        settings.codex_args = Some("--profile personal".to_string());

        let entry = WorkspaceEntry {
            id: "w1".to_string(),
            name: "Workspace".to_string(),
            path: "/tmp".to_string(),
            codex_bin: None,
            kind: WorkspaceKind::Main,
            parent_id: None,
            worktree: None,
            settings: settings.clone(),
        };

        write_workspaces(&path, &[entry]).expect("write workspaces");
        let read = read_workspaces(&path).expect("read workspaces");
        let stored = read.get("w1").expect("stored workspace");
        assert_eq!(stored.settings.sort_order, Some(5));
        assert_eq!(stored.settings.group_id.as_deref(), Some("group-42"));
        assert!(stored.settings.sidebar_collapsed);
        assert_eq!(stored.settings.git_root.as_deref(), Some("/tmp"));
        assert_eq!(
            stored.settings.codex_args.as_deref(),
            Some("--profile personal")
        );
    }

    #[test]
    fn write_workspaces_preserving_existing_merges_concurrent_import_snapshots() {
        let temp_dir = std::env::temp_dir().join(format!("moss-x-test-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&temp_dir).expect("create temp dir");
        let path = temp_dir.join("workspaces.json");

        let base_settings = WorkspaceSettings::default();
        let entry_a = WorkspaceEntry {
            id: "workspace-a".to_string(),
            name: "Workspace A".to_string(),
            path: "/tmp/workspace-a".to_string(),
            codex_bin: None,
            kind: WorkspaceKind::Main,
            parent_id: None,
            worktree: None,
            settings: base_settings.clone(),
        };
        let entry_b = WorkspaceEntry {
            id: "workspace-b".to_string(),
            name: "Workspace B".to_string(),
            path: "/tmp/workspace-b".to_string(),
            codex_bin: None,
            kind: WorkspaceKind::Main,
            parent_id: None,
            worktree: None,
            settings: base_settings,
        };

        write_workspaces_preserving_existing(&path, &[entry_a]).expect("write first snapshot");
        write_workspaces_preserving_existing(&path, &[entry_b]).expect("write second snapshot");

        let read = read_workspaces(&path).expect("read merged list");
        assert_eq!(read.len(), 2);
        assert!(read.contains_key("workspace-a"));
        assert!(read.contains_key("workspace-b"));
    }

    #[test]
    fn write_workspaces_preserving_existing_serializes_parallel_writes() {
        let temp_dir = std::env::temp_dir().join(format!("moss-x-test-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&temp_dir).expect("create temp dir");
        let path = Arc::new(temp_dir.join("workspaces.json"));
        let barrier = Arc::new(Barrier::new(2));

        let path_a = path.clone();
        let barrier_a = barrier.clone();
        let thread_a = thread::spawn(move || {
            let entry = WorkspaceEntry {
                id: "workspace-a".to_string(),
                name: "Workspace A".to_string(),
                path: "/tmp/workspace-a".to_string(),
                codex_bin: None,
                kind: WorkspaceKind::Main,
                parent_id: None,
                worktree: None,
                settings: WorkspaceSettings::default(),
            };
            barrier_a.wait();
            write_workspaces_preserving_existing(&path_a, &[entry]).expect("thread a write");
        });

        let path_b = path.clone();
        let barrier_b = barrier.clone();
        let thread_b = thread::spawn(move || {
            let entry = WorkspaceEntry {
                id: "workspace-b".to_string(),
                name: "Workspace B".to_string(),
                path: "/tmp/workspace-b".to_string(),
                codex_bin: None,
                kind: WorkspaceKind::Main,
                parent_id: None,
                worktree: None,
                settings: WorkspaceSettings::default(),
            };
            barrier_b.wait();
            write_workspaces_preserving_existing(&path_b, &[entry]).expect("thread b write");
        });

        thread_a.join().expect("thread a join");
        thread_b.join().expect("thread b join");

        let read = read_workspaces(path.as_ref()).expect("read merged list");
        assert_eq!(read.len(), 2);
        assert!(read.contains_key("workspace-a"));
        assert!(read.contains_key("workspace-b"));
    }

    #[test]
    fn write_workspaces_replace_mode_still_allows_pruning() {
        let temp_dir = std::env::temp_dir().join(format!("moss-x-test-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&temp_dir).expect("create temp dir");
        let path = temp_dir.join("workspaces.json");

        let entry_a = WorkspaceEntry {
            id: "workspace-a".to_string(),
            name: "Workspace A".to_string(),
            path: "/tmp/workspace-a".to_string(),
            codex_bin: None,
            kind: WorkspaceKind::Main,
            parent_id: None,
            worktree: None,
            settings: WorkspaceSettings::default(),
        };
        let entry_b = WorkspaceEntry {
            id: "workspace-b".to_string(),
            name: "Workspace B".to_string(),
            path: "/tmp/workspace-b".to_string(),
            codex_bin: None,
            kind: WorkspaceKind::Main,
            parent_id: None,
            worktree: None,
            settings: WorkspaceSettings::default(),
        };

        write_workspaces(&path, &[entry_a.clone(), entry_b]).expect("write initial workspaces");
        write_workspaces(&path, &[entry_a]).expect("write pruned workspace list");

        let read = read_workspaces(&path).expect("read pruned list");
        assert_eq!(read.len(), 1);
        assert!(read.contains_key("workspace-a"));
    }
}
