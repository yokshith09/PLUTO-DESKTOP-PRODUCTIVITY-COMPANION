//! Developer reactions without hooks (P4.3a): watches every git repository inside the folders
//! the person picked once (`dev.git_roots`) and makes the pet react to commits and successful
//! pushes. The rules live in `pluto_core::devwatch`; this file is the timer, the folder picker
//! and the commands.

use std::path::PathBuf;
use std::sync::{Arc, Mutex, PoisonError};
use std::time::{Duration, Instant};

use pluto_core::devwatch::{self, Watcher, ROOTS_PREF};
use pluto_core::error::{AppError, Result};
use pluto_core::mcp::{PlutoMcp, RateLimit};
use pluto_core::settings_service::SettingsService;
use serde::Serialize;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_dialog::DialogExt;

/// How often the reflogs are read (a few small files per repository).
const TICK: Duration = Duration::from_secs(3);
/// How often the chosen folders are searched again for new repositories.
const RESCAN: Duration = Duration::from_secs(60);

#[derive(Default)]
pub struct DevWatch {
    repos: Mutex<Vec<PathBuf>>,
    /// Set when the folders change, so the next tick searches again at once.
    dirty: std::sync::atomic::AtomicBool,
}

async fn roots(settings: &SettingsService) -> Vec<PathBuf> {
    let stored = settings.get_pref(ROOTS_PREF).await.ok().flatten();
    devwatch::clean_roots(stored.as_ref())
}

fn search(roots: &[PathBuf]) -> Vec<PathBuf> {
    let mut all: Vec<PathBuf> = roots.iter().flat_map(|r| devwatch::find_repos(r)).collect();
    all.sort();
    all.dedup();
    all.truncate(devwatch::MAX_REPOS);
    all
}

/// Runs for the life of the app. Expects [`DevWatch`] and [`crate::mcp::Mcp`] in the app state.
pub fn start(app: AppHandle, settings: Arc<SettingsService>) {
    tauri::async_runtime::spawn(async move {
        let watch = app.state::<DevWatch>();
        let mut watcher = Watcher::new();
        let mut last_scan: Option<Instant> = None;
        let limit = Arc::new(RateLimit::default());
        loop {
            let due = last_scan.is_none_or(|t| t.elapsed() >= RESCAN);
            if due
                || watch
                    .dirty
                    .swap(false, std::sync::atomic::Ordering::Relaxed)
            {
                let chosen = roots(&settings).await;
                let found = tauri::async_runtime::spawn_blocking(move || search(&chosen))
                    .await
                    .unwrap_or_default();
                *watch.repos.lock().unwrap_or_else(PoisonError::into_inner) = found;
                last_scan = Some(Instant::now());
            }
            let repos = watch
                .repos
                .lock()
                .unwrap_or_else(PoisonError::into_inner)
                .clone();
            if !repos.is_empty() {
                let (w, seen) = tauri::async_runtime::spawn_blocking(move || {
                    let seen = watcher.poll(&repos);
                    (watcher, seen)
                })
                .await
                .unwrap_or_else(|_| (Watcher::new(), Vec::new()));
                watcher = w;
                if let Some((repo, reaction)) = seen.last() {
                    tracing::info!(repo = %repo.display(), reaction, "git activity");
                    let mcp = app.state::<crate::mcp::Mcp>();
                    let host = crate::mcp::shell_host(&app, &mcp);
                    let _ = PlutoMcp::new(host, "Git", limit.clone()).react_once(reaction);
                }
            }
            tokio::time::sleep(TICK).await;
        }
    });
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitWatchInfo {
    /// The folders picked, as typed paths.
    pub roots: Vec<String>,
    /// The repositories found inside them (at most 200).
    pub repos: Vec<String>,
}

async fn info(settings: &SettingsService) -> GitWatchInfo {
    let chosen = roots(settings).await;
    let names: Vec<String> = chosen.iter().map(|p| p.display().to_string()).collect();
    let repos = tauri::async_runtime::spawn_blocking(move || search(&chosen))
        .await
        .unwrap_or_default()
        .iter()
        .map(|p| p.display().to_string())
        .collect();
    GitWatchInfo {
        roots: names,
        repos,
    }
}

async fn save(
    settings: &SettingsService,
    watch: &DevWatch,
    list: Vec<PathBuf>,
) -> Result<GitWatchInfo> {
    let value = serde_json::Value::from(
        list.iter()
            .map(|p| p.display().to_string())
            .collect::<Vec<_>>(),
    );
    settings.set_pref(ROOTS_PREF, value).await?;
    watch
        .dirty
        .store(true, std::sync::atomic::Ordering::Relaxed);
    Ok(info(settings).await)
}

#[tauri::command]
pub async fn dev_git_watch(settings: State<'_, Arc<SettingsService>>) -> Result<GitWatchInfo> {
    Ok(info(&settings).await)
}

/// Asks for a folder and adds it. `None` when the dialog was cancelled.
#[tauri::command]
pub async fn dev_git_add_folder(
    app: AppHandle,
    settings: State<'_, Arc<SettingsService>>,
    watch: State<'_, DevWatch>,
) -> Result<Option<GitWatchInfo>> {
    let picker = app.clone();
    let chosen = tauri::async_runtime::spawn_blocking(move || {
        picker
            .dialog()
            .file()
            .set_title("Pick the folder that holds your projects")
            .blocking_pick_folder()
    })
    .await
    .map_err(|_| AppError::internal("The folder dialog stopped unexpectedly."))?;
    let Some(chosen) = chosen else {
        return Ok(None);
    };
    let path = chosen
        .into_path()
        .map_err(|_| AppError::io("Pluto can't use that folder."))?;
    let mut list = roots(&settings).await;
    if !list.contains(&path) {
        list.push(path);
    }
    save(&settings, &watch, list).await.map(Some)
}

#[tauri::command]
pub async fn dev_git_remove_folder(
    path: String,
    settings: State<'_, Arc<SettingsService>>,
    watch: State<'_, DevWatch>,
) -> Result<GitWatchInfo> {
    let list = roots(&settings)
        .await
        .into_iter()
        .filter(|p| p.display().to_string() != path)
        .collect();
    save(&settings, &watch, list).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn two_folders_that_overlap_give_each_repository_once() {
        let dir = tempfile::tempdir().unwrap();
        let app = dir.path().join("work/app");
        std::fs::create_dir_all(app.join(".git/logs")).unwrap();
        let found = search(&[dir.path().to_owned(), dir.path().join("work")]);
        assert_eq!(found, vec![app]);
    }
}
