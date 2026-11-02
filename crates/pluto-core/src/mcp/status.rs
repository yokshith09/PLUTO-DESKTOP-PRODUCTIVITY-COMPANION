//! The answer to the `status` tool, read from Pluto's own data (no titles, no note text).

use crate::clock::Clock;
use crate::db::Database;
use crate::focus::{self, FocusKind};

use super::{FocusNow, Status, TodayCounts};

/// What Pluto is doing now. `app_in_front` comes from the tracker (program name only), when on.
/// A part that cannot be read is left empty rather than failing the whole answer.
pub async fn read(db: &Database, clock: &dyn Clock, app_in_front: Option<String>) -> Status {
    let now = clock.now_ms();
    let focus = focus::current(db, clock)
        .await
        .ok()
        .flatten()
        .map(|s| FocusNow {
            kind: match s.kind {
                FocusKind::Focus => "focus".into(),
                FocusKind::Break => "break".into(),
            },
            minutes_left: u32::try_from((focus::remaining_ms(&s, now) + 59_999) / 60_000)
                .unwrap_or(0),
            paused: s.paused_at.is_some(),
        });
    let today = crate::daily_log::get(db, clock, clock.today())
        .await
        .ok()
        .flatten()
        .map(|log| {
            let stats = &log.snapshot.stats;
            TodayCounts {
                done: stats.completed_count,
                open: stats.planned_count.saturating_sub(stats.completed_count),
                overdue: u32::try_from(log.snapshot.overdue.len()).unwrap_or(u32::MAX),
            }
        })
        .unwrap_or_default();
    Status {
        focus,
        app_in_front,
        today,
    }
}

#[cfg(test)]
mod tests {
    use chrono::NaiveDate;
    use chrono_tz::Tz;

    use super::*;
    use crate::bus::EventBus;
    use crate::clock::FakeClock;
    use crate::focus::FocusStart;

    #[tokio::test]
    async fn status_shows_the_running_focus_session_and_an_empty_day() {
        let dir = tempfile::tempdir().unwrap();
        let db = Database::open(&dir.path().join("pluto.db"), EventBus::default()).unwrap();
        let clock = FakeClock::at_local(
            Tz::Asia__Kolkata,
            NaiveDate::from_ymd_opt(2026, 11, 2).unwrap(),
            10,
            0,
            0,
        );
        let idle = read(&db, &clock, None).await;
        assert_eq!(idle.focus, None);
        assert_eq!(idle.today, TodayCounts::default());

        focus::start(
            &db,
            &clock,
            FocusStart {
                kind: FocusKind::Focus,
                minutes: 25,
                task_id: None,
            },
        )
        .await
        .unwrap();
        clock.advance_ms(10 * 60_000 + 1);
        let busy = read(&db, &clock, Some("VS Code".into())).await;
        let f = busy.focus.expect("focus running");
        assert_eq!(
            (f.kind.as_str(), f.minutes_left, f.paused),
            ("focus", 15, false)
        );
        assert_eq!(busy.app_in_front.as_deref(), Some("VS Code"));
    }
}
