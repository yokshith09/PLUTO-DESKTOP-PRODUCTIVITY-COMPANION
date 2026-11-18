//! Class reminders (K-3): the pet says "Physics in 10 min · Lab 3" before a class that has a
//! reminder. The rule lives in `pluto_core::class_alerts`; this loop only waits for the next alert
//! and shows it. It sleeps until the alert (at most a minute at a time, so a changed clock or a
//! sleeping computer is noticed) and wakes early when a class is added, changed or deleted.
//! Silent during a focus session and while the pet is hidden, like the other pet notices.
//! Unverified on a real Windows or Mac PC.

use std::sync::Arc;
use std::time::Duration;

use chrono::{Duration as Span, NaiveDateTime};
use pluto_core::class_alerts::{local_time, next_class_alert};
use pluto_core::classes;
use pluto_core::clock::Clock;
use serde_json::json;
use tauri::{AppHandle, Emitter, Manager, Runtime};
use tokio::sync::Notify;

use crate::pet;

/// Wakes the loop early; held as managed state so the class commands can reach it.
#[derive(Clone, Default)]
pub struct Rearm(pub Arc<Notify>);

const SLICE: Duration = Duration::from_secs(60);
/// An alert that is older than this when it is handled (the computer slept) is dropped, not told late.
const STALE: i64 = 5;

/// Is an alert still worth showing at `now`? Fresh enough, and not during focus or with the pet hidden.
pub fn worth_showing(at: NaiveDateTime, now: NaiveDateTime, focusing: bool, hidden: bool) -> bool {
    !focusing && !hidden && now - at <= Span::minutes(STALE)
}

pub fn start<R: Runtime>(app: AppHandle<R>, rearm: Rearm) {
    tauri::async_runtime::spawn(async move {
        let mut cursor: Option<NaiveDateTime> = None;
        loop {
            let Some(core) = app.try_state::<crate::Core>() else {
                tokio::time::sleep(Duration::from_secs(5)).await;
                continue;
            };
            let tz = core.clock.tz();
            let now = local_time(core.clock.now_ms(), tz);
            let after = *cursor.get_or_insert(now);
            let list = classes::list(&core.db).await.unwrap_or_default();
            let wait = match next_class_alert(&list, after) {
                Some((at, text)) if at <= now => {
                    cursor = Some(at);
                    let focusing = pluto_core::focus::current(&core.db, &*core.clock)
                        .await
                        .ok()
                        .flatten()
                        .is_some();
                    let hidden = pet::window(&app).is_none_or(|w| !w.is_visible().unwrap_or(false));
                    if worth_showing(at, now, focusing, hidden) {
                        let _ = app.emit(
                            "pet://say",
                            json!({ "text": text, "pose": "wave", "ms": 9000, "go": "page:study" }),
                        );
                    }
                    continue;
                }
                Some((at, _)) => (at - now).to_std().unwrap_or_default().min(SLICE),
                None => SLICE,
            };
            tokio::select! {
                () = tokio::time::sleep(wait) => {}
                () = rearm.0.notified() => {}
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::NaiveDate;

    fn t(h: u32, m: u32) -> NaiveDateTime {
        NaiveDate::from_ymd_opt(2026, 11, 16)
            .unwrap()
            .and_hms_opt(h, m, 0)
            .unwrap()
    }

    #[test]
    fn a_fresh_alert_shows_and_a_late_one_is_dropped() {
        assert!(worth_showing(t(8, 50), t(8, 50), false, false));
        assert!(worth_showing(t(8, 50), t(8, 55), false, false));
        assert!(
            !worth_showing(t(8, 50), t(8, 56), false, false),
            "slept through it"
        );
    }

    #[test]
    fn it_stays_quiet_while_focusing_or_with_the_pet_hidden() {
        assert!(!worth_showing(t(8, 50), t(8, 50), true, false));
        assert!(!worth_showing(t(8, 50), t(8, 50), false, true));
    }
}
