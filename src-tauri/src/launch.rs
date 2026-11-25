//! Launch Buddy (P5 item 2, FR-72): run a saved launch set. The set is read from the stored
//! preference by its id, never taken from the page, so only what the person saved can open
//! (`pluto_core::launch`). A missing file is named in the report, never silently skipped.

use std::sync::Arc;

use pluto_core::error::{AppError, Result};
use pluto_core::launch::{self, LaunchReport, Step, LAUNCH_PREF, MAX_ITEMS};
use pluto_core::links;
use pluto_core::settings_service::SettingsService;
use tauri::{AppHandle, State};
use tauri_plugin_opener::OpenerExt;

#[tauri::command]
pub async fn launch_set_run(
    app: AppHandle,
    id: String,
    settings: State<'_, Arc<SettingsService>>,
) -> Result<LaunchReport> {
    let stored = settings.get_pref(LAUNCH_PREF).await?;
    let set = launch::parse(stored.as_ref())
        .into_iter()
        .find(|s| s.id == id)
        .ok_or_else(|| AppError::validation("id", "That launch set no longer exists."))?;
    if set.items.len() > MAX_ITEMS {
        return Err(AppError::validation(
            "items",
            "A launch set opens at most 20 things at once.",
        ));
    }
    let opener = app.opener();
    let mut report = LaunchReport {
        focus_minutes: set.focus_minutes,
        ..LaunchReport::default()
    };
    for item in set.items {
        let label = item.label;
        match launch::step(&item.target, |p| p.exists()) {
            Step::Web(url) => {
                let opened = links::validate_external_url(&url)
                    .is_ok_and(|url| opener.open_url(url, None::<&str>).is_ok());
                if opened {
                    report.opened.push(label);
                } else {
                    report.failed.push(label);
                }
            }
            Step::Open(path) => {
                if opener
                    .open_path(path.display().to_string(), None::<&str>)
                    .is_ok()
                {
                    report.opened.push(label);
                } else {
                    report.failed.push(label);
                }
            }
            Step::Reveal(path) => {
                if opener.reveal_item_in_dir(&path).is_ok() {
                    report.shown.push(label);
                } else {
                    report.failed.push(label);
                }
            }
            Step::Missing(_) => report.missing.push(label),
            Step::Refused(_) => report.failed.push(label),
        }
    }
    tracing::info!(
        opened = report.opened.len(),
        shown = report.shown.len(),
        missing = report.missing.len(),
        failed = report.failed.len(),
        "ran a launch set"
    );
    Ok(report)
}
