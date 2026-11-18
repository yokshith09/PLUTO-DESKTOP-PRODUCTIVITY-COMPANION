//! When the pet should tell you a class is about to start (K-3). Pure rule, no clock and no
//! database: give it the classes and the moment the last alert was handled, and it returns the next
//! alert time and the words. Only classes with a reminder (`remind_min`) count; a class repeats
//! weekly, on odd or even ISO weeks, or happens once on its date.

use chrono::{DateTime, Datelike, Duration, NaiveDate, NaiveDateTime, NaiveTime};
use chrono_tz::Tz;

use crate::classes::Class;

/// How far ahead to look: an odd/even class comes back within 14 days, plus the day it starts.
const LOOKAHEAD_DAYS: i64 = 15;

fn occurs(c: &Class, date: NaiveDate) -> bool {
    if c.repeat == "once" {
        return c.once_date.as_deref() == Some(date.to_string().as_str());
    }
    if date.weekday().num_days_from_monday() != c.day {
        return false;
    }
    match c.repeat.as_str() {
        "weekly" => true,
        "odd" => date.iso_week().week() % 2 == 1,
        "even" => date.iso_week().week().is_multiple_of(2),
        _ => false,
    }
}

fn words(c: &Class, minutes: u32) -> String {
    if c.place.is_empty() {
        format!("{} in {minutes} min", c.title)
    } else {
        format!("{} in {minutes} min · {}", c.title, c.place)
    }
}

/// A moment (milliseconds since 1970) as local wall-clock time in `tz`.
pub fn local_time(ms: i64, tz: Tz) -> NaiveDateTime {
    DateTime::from_timestamp_millis(ms)
        .unwrap_or_default()
        .with_timezone(&tz)
        .naive_local()
}

/// The first alert strictly after `after` (local time), with the bubble text. Classes whose alert
/// falls at the same minute share one bubble, joined with "and".
pub fn next_class_alert(
    classes: &[Class],
    after: NaiveDateTime,
) -> Option<(NaiveDateTime, String)> {
    let mut found: Vec<(NaiveDateTime, &Class, u32)> = Vec::new();
    for offset in 0..=LOOKAHEAD_DAYS {
        let date = after.date() + Duration::days(offset);
        for c in classes {
            let Some(minutes) = c.remind_min else {
                continue;
            };
            if !occurs(c, date) {
                continue;
            }
            let at = date.and_time(NaiveTime::MIN)
                + Duration::minutes(i64::from(c.start_min) - i64::from(minutes));
            if at > after {
                found.push((at, c, minutes));
            }
        }
    }
    let first = found.iter().map(|f| f.0).min()?;
    let text = found
        .iter()
        .filter(|f| f.0 == first)
        .map(|(_, c, m)| words(c, *m))
        .collect::<Vec<_>>()
        .join(" and ");
    Some((first, text))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn class(title: &str, day: u32, start: u32, remind: Option<u32>) -> Class {
        Class {
            id: title.into(),
            course_id: None,
            title: title.into(),
            day,
            start_min: start,
            end_min: start + 60,
            place: String::new(),
            teacher: String::new(),
            repeat: "weekly".into(),
            once_date: None,
            remind_min: remind,
        }
    }

    fn at(y: i32, m: u32, d: u32, h: u32, min: u32) -> NaiveDateTime {
        NaiveDate::from_ymd_opt(y, m, d)
            .unwrap()
            .and_hms_opt(h, min, 0)
            .unwrap()
    }

    // 2026-11-16 is a Monday (ISO week 47, odd).
    #[test]
    fn a_weekly_class_alerts_ten_minutes_before_it_starts() {
        let c = Class {
            place: "Lab 3".into(),
            ..class("Physics", 0, 9 * 60, Some(10))
        };
        let (when, text) = next_class_alert(&[c], at(2026, 11, 16, 8, 0)).unwrap();
        assert_eq!(when, at(2026, 11, 16, 8, 50));
        assert_eq!(text, "Physics in 10 min · Lab 3");
    }

    #[test]
    fn no_reminder_means_no_alert() {
        assert!(
            next_class_alert(&[class("Maths", 0, 540, None)], at(2026, 11, 16, 0, 0)).is_none()
        );
        assert!(next_class_alert(&[], at(2026, 11, 16, 0, 0)).is_none());
    }

    #[test]
    fn a_class_that_already_started_or_whose_alert_passed_waits_for_next_week() {
        let c = class("Physics", 0, 9 * 60, Some(30));
        // 09:10 on Monday: the 08:30 alert is behind us.
        let (when, _) =
            next_class_alert(std::slice::from_ref(&c), at(2026, 11, 16, 9, 10)).unwrap();
        assert_eq!(when, at(2026, 11, 23, 8, 30));
        // Exactly at the alert time: it is handled, so the next one is a week later.
        let (when, _) = next_class_alert(&[c], at(2026, 11, 16, 8, 30)).unwrap();
        assert_eq!(when, at(2026, 11, 23, 8, 30));
    }

    #[test]
    fn odd_and_even_weeks_alternate() {
        let odd = Class {
            repeat: "odd".into(),
            ..class("Odd", 0, 600, Some(10))
        };
        let even = Class {
            repeat: "even".into(),
            ..class("Even", 0, 600, Some(10))
        };
        // Week 47 (odd) Monday: only the odd class; the even one comes the Monday after.
        let (when, text) =
            next_class_alert(&[odd.clone(), even.clone()], at(2026, 11, 16, 0, 0)).unwrap();
        assert_eq!(
            (when, text.as_str()),
            (at(2026, 11, 16, 9, 50), "Odd in 10 min")
        );
        let (when, text) =
            next_class_alert(&[odd.clone(), even.clone()], at(2026, 11, 16, 9, 50)).unwrap();
        assert_eq!(
            (when, text.as_str()),
            (at(2026, 11, 23, 9, 50), "Even in 10 min")
        );
        let (when, _) = next_class_alert(&[odd], at(2026, 11, 23, 0, 0)).unwrap();
        assert_eq!(when, at(2026, 11, 30, 9, 50));
    }

    #[test]
    fn a_one_off_class_alerts_once_on_its_date() {
        let c = Class {
            repeat: "once".into(),
            once_date: Some("2026-11-20".into()),
            ..class("Review", 4, 14 * 60, Some(30))
        };
        let (when, _) = next_class_alert(std::slice::from_ref(&c), at(2026, 11, 16, 0, 0)).unwrap();
        assert_eq!(when, at(2026, 11, 20, 13, 30));
        assert!(next_class_alert(&[c], at(2026, 11, 20, 13, 30)).is_none());
    }

    #[test]
    fn a_class_just_after_midnight_alerts_the_evening_before() {
        let c = class("Night owl", 1, 5, Some(30)); // Tuesday 00:05
        let (when, text) = next_class_alert(&[c], at(2026, 11, 16, 12, 0)).unwrap();
        assert_eq!(when, at(2026, 11, 16, 23, 35));
        assert_eq!(text, "Night owl in 30 min");
    }

    #[test]
    fn two_classes_alerting_together_share_one_bubble() {
        let a = Class {
            place: "A1".into(),
            ..class("Physics", 0, 540, Some(10))
        };
        let b = class("Maths", 0, 540, Some(10));
        let c = class("Later", 0, 600, Some(10));
        let (when, text) = next_class_alert(&[a, b, c], at(2026, 11, 16, 8, 0)).unwrap();
        assert_eq!(when, at(2026, 11, 16, 8, 50));
        assert_eq!(text, "Physics in 10 min · A1 and Maths in 10 min");
    }

    #[test]
    fn local_time_follows_the_zone() {
        let noon_utc = 1_793_188_800_000; // 2026-10-28 12:00 UTC
        assert_eq!(
            local_time(noon_utc, Tz::UTC).format("%H:%M").to_string(),
            "12:00"
        );
        assert_eq!(
            local_time(noon_utc, Tz::Asia__Kolkata)
                .format("%H:%M")
                .to_string(),
            "17:30"
        );
    }

    #[test]
    fn changing_or_deleting_a_class_changes_the_next_alert() {
        let mut list = vec![
            class("Physics", 0, 540, Some(10)),
            class("Maths", 2, 540, Some(10)),
        ];
        let now = at(2026, 11, 16, 0, 0);
        assert_eq!(next_class_alert(&list, now).unwrap().1, "Physics in 10 min");
        list[0].remind_min = Some(30);
        assert_eq!(
            next_class_alert(&list, now).unwrap().0,
            at(2026, 11, 16, 8, 30)
        );
        list.remove(0);
        assert_eq!(next_class_alert(&list, now).unwrap().1, "Maths in 10 min");
    }
}
