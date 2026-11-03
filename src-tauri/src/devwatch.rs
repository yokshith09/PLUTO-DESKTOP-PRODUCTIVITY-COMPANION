//! Developer reactions without hooks (P4.3a): watches every git repository inside the folders
//! the person picked once (`dev.git_roots`) and makes the pet react to commits and successful
//! pushes. The rules live in `pluto_core::devwatch`; this file is the timer, the folder picker
//! and the commands.

use std::path::PathBuf;
use std::sync::{Arc, Mutex, PoisonError};
use std::time::{Duration, Instant};

use pluto_core::clock::Clock;
use pluto_core::devwatch::{self, GitEvent, Watcher, EVENTS_PREF, ROOTS_PREF};
use pluto_core::error::{AppError, Result};
use pluto_core::mcp::{PlutoMcp, RateLimit};
use pluto_core::settings_service::SettingsService;
use pluto_core::spaces::{self, OpenAs, SPACES_PREF};
use serde::Serialize;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

/// How often the reflogs are read (a few small files per repository).
const TICK: Duration = Duration::from_secs(3);
/// How often the chosen folders are searched again for new repositories.
const RESCAN: Duration = Duration::from_secs(60);

#[derive(Default)]
pub struct DevWatch {
    repos: Mutex<Vec<PathBuf>>,
    /// Set when the folders change, so the next tick searches again at once.
    dirty: std::sync::atomic::AtomicBool,
    /// Commits and pushes seen, newest first (kept in `dev.git_events`).
    events: Mutex<Vec<GitEvent>>,
}

async fn spaces_now(settings: &SettingsService) -> Vec<spaces::Space> {
    let stored = settings.get_pref(SPACES_PREF).await.ok().flatten();
    spaces::parse(stored.as_ref())
}

/// What to watch: every repository under the chosen folders, plus each project's own folder
/// (linked by hand, maybe outside them) when it is a git repository.
fn watched(roots: &[PathBuf], linked: &[PathBuf]) -> Vec<PathBuf> {
    let mut all = search(roots);
    for f in linked {
        if f.join(".git").exists() && !all.iter().any(|r| spaces::same_path(r, f)) {
            all.push(f.clone());
        }
    }
    all.truncate(devwatch::MAX_REPOS);
    all
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
        let saved = settings.get_pref(EVENTS_PREF).await.ok().flatten();
        *watch.events.lock().unwrap_or_else(PoisonError::into_inner) =
            devwatch::events_from(saved.as_ref());
        loop {
            let due = last_scan.is_none_or(|t| t.elapsed() >= RESCAN);
            if due
                || watch
                    .dirty
                    .swap(false, std::sync::atomic::Ordering::Relaxed)
            {
                let chosen = roots(&settings).await;
                let linked: Vec<PathBuf> = spaces_now(&settings)
                    .await
                    .into_iter()
                    .filter_map(|s| s.folder)
                    .collect();
                let found = tauri::async_runtime::spawn_blocking(move || watched(&chosen, &linked))
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
                if !seen.is_empty() {
                    let now = app
                        .try_state::<crate::Core>()
                        .map(|c| c.clock.now_ms())
                        .unwrap_or_default();
                    let list = {
                        let mut list = watch.events.lock().unwrap_or_else(PoisonError::into_inner);
                        for (repo, kind) in &seen {
                            devwatch::remember(
                                &mut list,
                                GitEvent {
                                    repo: repo.display().to_string(),
                                    kind: (*kind).into(),
                                    at_ms: now,
                                },
                            );
                        }
                        list.clone()
                    };
                    let _ = settings
                        .set_pref(EVENTS_PREF, serde_json::to_value(&list).unwrap_or_default())
                        .await;
                    let _ = tauri::Emitter::emit(&app, "dev://git", ());
                }
                if let Some((repo, reaction)) = seen.last() {
                    tracing::info!(repo = %repo.display(), reaction, "git activity");
                    // "Pluto: pushed": the project's name, else the folder's (owner 2026-11-02).
                    let all = spaces_now(&settings).await;
                    let name = spaces::project_for(&all, repo)
                        .map(str::to_owned)
                        .unwrap_or_else(|| spaces::folder_name(repo));
                    let mcp = app.state::<crate::mcp::Mcp>();
                    let host = crate::mcp::shell_host(&app, &mcp);
                    let _ = PlutoMcp::new(host, &name, limit.clone()).react_once(reaction, None);
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

/// Commits and pushes seen (newest first), for a project's Activity.
#[tauri::command]
pub fn dev_git_events(watch: State<'_, DevWatch>) -> Vec<GitEvent> {
    watch
        .events
        .lock()
        .unwrap_or_else(PoisonError::into_inner)
        .clone()
}

/// Asks for a folder or a file for a project. `None` when the dialog was cancelled.
#[tauri::command]
pub async fn project_path_pick(app: AppHandle, kind: String) -> Result<Option<String>> {
    let picker = app.clone();
    let folder = kind == "folder";
    let chosen = tauri::async_runtime::spawn_blocking(move || {
        let d = picker.dialog().file();
        if folder {
            d.set_title("Pick the project's folder")
                .blocking_pick_folder()
        } else {
            d.set_title("Pick a file for the project")
                .blocking_pick_file()
        }
    })
    .await
    .map_err(|_| AppError::internal("The dialog stopped unexpectedly."))?;
    Ok(chosen
        .and_then(|c| c.into_path().ok())
        .map(|p| p.display().to_string()))
}

/// Opens a project's folder or one of its file links. Only paths saved in a project open;
/// programs and scripts are shown in their folder instead of run.
#[tauri::command]
pub async fn project_path_open(
    app: AppHandle,
    path: String,
    settings: State<'_, Arc<SettingsService>>,
) -> Result<()> {
    let target = PathBuf::from(&path);
    if !spaces::is_listed(&spaces_now(&settings).await, &target) {
        return Err(AppError::validation(
            "path",
            "Pluto opens only folders and files saved in a project.",
        ));
    }
    if !target.exists() {
        return Err(AppError::io(
            "That file or folder is no longer there. It may have been moved or renamed.",
        ));
    }
    let opener = app.opener();
    let done = match spaces::open_as(&target) {
        OpenAs::Open => opener.open_path(path, None::<&str>),
        OpenAs::ShowInFolder => opener.reveal_item_in_dir(&target),
    };
    done.map_err(|_| AppError::io("Pluto couldn't open that."))
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
        assert_eq!(found, vec![app.clone()]);
    }

    #[test]
    fn a_project_folder_linked_by_hand_outside_the_chosen_folders_is_watched_once() {
        let dir = tempfile::tempdir().unwrap();
        let inside = dir.path().join("work/app");
        let outside = dir.path().join("elsewhere/site");
        std::fs::create_dir_all(inside.join(".git/logs")).unwrap();
        std::fs::create_dir_all(outside.join(".git/logs")).unwrap();
        let plain = dir.path().join("notes");
        std::fs::create_dir_all(&plain).unwrap();
        let w = watched(
            &[dir.path().join("work")],
            &[outside.clone(), inside.clone(), plain],
        );
        assert_eq!(w, vec![inside, outside]);
    }
}
