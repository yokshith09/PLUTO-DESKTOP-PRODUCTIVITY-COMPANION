//! Tab Tantrum (TT-1): watches how many tabs the front browser window has and lets the pet react
//! (rule in `pluto_core::tantrum`). Off by default; needs the same permission as reading open tabs
//! (`tracking.apps` and `tracking.sites`). The count is read every few seconds only while it is on.
//! Unverified on a real Windows or Mac PC.

use std::sync::Arc;
use std::time::Duration;

use pluto_core::clock::Clock;
use pluto_core::settings_service::SettingsService;
use pluto_core::tantrum::{clamp_limit, line, Step, Tracker, DEFAULT_LIMIT};
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Manager, Runtime};

use crate::{pet, tabs};

/// `{ "on": bool, "limit": number }`, kept as a preference.
pub const PREF: &str = "pet.tantrum";
const TICK: Duration = Duration::from_secs(8);

/// (on, limit) from the saved preference; off and 15 when nothing is saved.
pub fn read(saved: Option<&Value>) -> (bool, u32) {
    let on = saved.and_then(|v| v.get("on")).and_then(Value::as_bool) == Some(true);
    let limit = saved
        .and_then(|v| v.get("limit"))
        .and_then(Value::as_i64)
        .map_or(DEFAULT_LIMIT, clamp_limit);
    (on, limit)
}

pub fn start<R: Runtime>(app: AppHandle<R>, settings: Arc<SettingsService>) {
    tauri::async_runtime::spawn(async move {
        let mut tracker = Tracker::default();
        loop {
            tokio::time::sleep(TICK).await;
            let (on, limit) = read(settings.get_pref(PREF).await.ok().flatten().as_ref());
            let focusing = match app.try_state::<crate::Core>() {
                Some(core) => pluto_core::focus::current(&core.db, &*core.clock)
                    .await
                    .ok()
                    .flatten()
                    .is_some(),
                None => false,
            };
            let hidden = pet::window(&app).is_none_or(|w| !w.is_visible().unwrap_or(false));
            let quiet = !on || focusing || hidden;
            let count = if quiet {
                None
            } else {
                tabs::busiest_window(&settings).await
            };
            let now = app
                .try_state::<crate::Core>()
                .map(|c| c.clock.now_ms())
                .unwrap_or_default();
            match tracker.step(count, limit, now, quiet) {
                Step::Idle => {}
                Step::Rage { count, first } => {
                    if first {
                        pet::tantrum_move(&app, true);
                    }
                    let _ = app.emit(
                        "pet://say",
                        json!({ "text": line(count), "pose": "worried", "ms": 9000, "go": "page:time" }),
                    );
                }
                Step::Calm => {
                    pet::tantrum_move(&app, false);
                    let _ = app.emit(
                        "pet://say",
                        json!({ "text": "Phew, much better.", "pose": "cheer", "ms": 5000 }),
                    );
                }
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn off_and_fifteen_until_the_person_changes_it() {
        assert_eq!(read(None), (false, 15));
        assert_eq!(read(Some(&json!({"on": true, "limit": 20}))), (true, 20));
        assert_eq!(read(Some(&json!({"on": true, "limit": 1}))), (true, 5));
        assert_eq!(read(Some(&json!({"on": "yes"}))), (false, 15));
    }
}
