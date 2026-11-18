//! The timetable (Study › Timetable): classes on a weekly grid, with CSV import and export.
//! A class has a weekday (0 is Monday), start and end in minutes of the day, and repeats every week,
//! on odd or even weeks, or happens once. Importing reads `course,day,start,end,place,teacher`.

use std::collections::BTreeMap;

use chrono::NaiveDate;
use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};

use crate::clock::Clock;
use crate::courses;
use crate::db::Database;
use crate::error::{AppError, Result};
use crate::ids::new_id;

pub const TITLE_MAX: usize = 80;
pub const TEXT_MAX: usize = 40;
const DAYS: [&str; 7] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const FULL_DAYS: [&str; 7] = [
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
];

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct Class {
    pub id: String,
    pub course_id: Option<String>,
    pub title: String,
    /// 0 is Monday, 6 is Sunday.
    pub day: u32,
    pub start_min: u32,
    pub end_min: u32,
    pub place: String,
    pub teacher: String,
    /// `weekly`, `odd`, `even` or `once`.
    pub repeat: String,
    pub once_date: Option<String>,
    /// Minutes before the class to remind (10 or 30).
    pub remind_min: Option<u32>,
}

/// What the editor sends. With a course and no title the course name is the title.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct ClassInput {
    pub course_id: Option<String>,
    pub title: String,
    pub day: u32,
    pub start_min: u32,
    pub end_min: u32,
    pub place: String,
    pub teacher: String,
    pub repeat: String,
    pub once_date: Option<String>,
    pub remind_min: Option<u32>,
}

/// One row read from a CSV file.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct ClassDraft {
    pub course: String,
    pub day: u32,
    pub start_min: u32,
    pub end_min: u32,
    pub place: String,
    pub teacher: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct LineError {
    pub line: u32,
    pub message: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct ClassPreview {
    pub rows: Vec<ClassDraft>,
    pub errors: Vec<LineError>,
}

fn text(field: &str, s: &str, max: usize) -> Result<String> {
    let s = s.trim();
    if s.chars().count() > max {
        return Err(AppError::validation(
            field,
            format!("That can be up to {max} characters."),
        ));
    }
    Ok(s.to_owned())
}

fn row(r: &rusqlite::Row) -> rusqlite::Result<Class> {
    Ok(Class {
        id: r.get(0)?,
        course_id: r.get(1)?,
        title: r.get(2)?,
        day: r.get(3)?,
        start_min: r.get(4)?,
        end_min: r.get(5)?,
        place: r.get(6)?,
        teacher: r.get(7)?,
        repeat: r.get(8)?,
        once_date: r.get(9)?,
        remind_min: r.get(10)?,
    })
}

const COLS: &str =
    "id, course_id, title, day, start_min, end_min, place, teacher, repeat, once_date, remind_min";

/// Check a class and fill the title; the course name is looked up inside the write.
fn clean(input: ClassInput, course_name: Option<String>) -> Result<ClassInput> {
    let mut title = text("title", &input.title, TITLE_MAX)?;
    if title.is_empty() {
        title = course_name.unwrap_or_default();
    }
    if title.is_empty() {
        return Err(AppError::validation(
            "title",
            "Pick a course or give the class a name.",
        ));
    }
    if input.day > 6 {
        return Err(AppError::validation("day", "Pick a day."));
    }
    if input.start_min > 1439 || input.end_min > 1440 || input.end_min <= input.start_min {
        return Err(AppError::validation(
            "end_min",
            "The class must end after it starts.",
        ));
    }
    if !["weekly", "odd", "even", "once"].contains(&input.repeat.as_str()) {
        return Err(AppError::validation("repeat", "Pick how it repeats."));
    }
    let once_date = match (input.repeat.as_str(), &input.once_date) {
        ("once", Some(d)) => Some(
            NaiveDate::parse_from_str(d, "%Y-%m-%d")
                .map_err(|_| AppError::validation("once_date", "Pick the date."))?
                .to_string(),
        ),
        ("once", None) => return Err(AppError::validation("once_date", "Pick the date.")),
        _ => None,
    };
    if input.remind_min.is_some_and(|m| m != 10 && m != 30) {
        return Err(AppError::validation(
            "remind_min",
            "Remind 10 or 30 minutes before.",
        ));
    }
    Ok(ClassInput {
        title,
        place: text("place", &input.place, TEXT_MAX)?,
        teacher: text("teacher", &input.teacher, TEXT_MAX)?,
        once_date,
        ..input
    })
}

fn course_name(tx: &rusqlite::Transaction, id: &Option<String>) -> Result<Option<String>> {
    Ok(match id {
        Some(id) => tx
            .query_row("SELECT name FROM courses WHERE id = ?1", [id], |r| r.get(0))
            .optional()?,
        None => None,
    })
}

fn insert(tx: &rusqlite::Transaction, now: i64, input: ClassInput) -> Result<Class> {
    let name = course_name(tx, &input.course_id)?;
    let i = clean(input, name)?;
    let c = Class {
        id: new_id(),
        course_id: i.course_id,
        title: i.title,
        day: i.day,
        start_min: i.start_min,
        end_min: i.end_min,
        place: i.place,
        teacher: i.teacher,
        repeat: i.repeat,
        once_date: i.once_date,
        remind_min: i.remind_min,
    };
    tx.execute(
        &format!("INSERT INTO classes ({COLS}, created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12)"),
        params![
            c.id,
            c.course_id,
            c.title,
            c.day,
            c.start_min,
            c.end_min,
            c.place,
            c.teacher,
            c.repeat,
            c.once_date,
            c.remind_min,
            now
        ],
    )?;
    Ok(c)
}

pub async fn list(db: &Database) -> Result<Vec<Class>> {
    db.read(|conn| {
        let mut stmt = conn.prepare(&format!(
            "SELECT {COLS} FROM classes ORDER BY day, start_min, title"
        ))?;
        let rows = stmt
            .query_map([], row)?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        Ok(rows)
    })
    .await
}

pub async fn add(db: &Database, clock: &dyn Clock, input: ClassInput) -> Result<Class> {
    let now = clock.now_ms();
    db.write(move |tx| Ok((insert(tx, now, input)?, vec![])))
        .await
}

pub async fn update(db: &Database, id: &str, input: ClassInput) -> Result<Class> {
    let id = id.to_owned();
    db.write(move |tx| {
        let name = course_name(tx, &input.course_id)?;
        let i = clean(input, name)?;
        let n = tx.execute(
            "UPDATE classes SET course_id=?1, title=?2, day=?3, start_min=?4, end_min=?5, place=?6,
                                teacher=?7, repeat=?8, once_date=?9, remind_min=?10 WHERE id=?11",
            params![
                i.course_id,
                i.title,
                i.day,
                i.start_min,
                i.end_min,
                i.place,
                i.teacher,
                i.repeat,
                i.once_date,
                i.remind_min,
                id
            ],
        )?;
        if n == 0 {
            return Err(AppError::not_found("That class no longer exists."));
        }
        let c = tx.query_row(
            &format!("SELECT {COLS} FROM classes WHERE id = ?1"),
            [&id],
            row,
        )?;
        Ok((c, vec![]))
    })
    .await
}

pub async fn delete(db: &Database, id: &str) -> Result<()> {
    let id = id.to_owned();
    db.write(move |tx| {
        if tx.execute("DELETE FROM classes WHERE id = ?1", [&id])? == 0 {
            return Err(AppError::not_found("That class no longer exists."));
        }
        Ok(((), vec![]))
    })
    .await
}

// ---- CSV ------------------------------------------------------------------------------------

/// Split one CSV line (commas, or semicolons when there are no commas), honouring "quoted, cells".
fn cells(line: &str, sep: char) -> Vec<String> {
    let (mut out, mut cur, mut quoted) = (Vec::new(), String::new(), false);
    let mut chars = line.chars().peekable();
    while let Some(c) = chars.next() {
        match c {
            '"' if quoted && chars.peek() == Some(&'"') => {
                cur.push('"');
                chars.next();
            }
            '"' => quoted = !quoted,
            c if c == sep && !quoted => out.push(std::mem::take(&mut cur)),
            c => cur.push(c),
        }
    }
    out.push(cur);
    out.into_iter().map(|c| c.trim().to_owned()).collect()
}

fn parse_day(s: &str) -> Option<u32> {
    let l = s.trim().to_lowercase();
    (0..7)
        .find(|&i| l == DAYS[i].to_lowercase() || l == FULL_DAYS[i])
        .map(|i| i as u32)
}

/// `9:30` or `09:30` as minutes of the day.
fn parse_time(s: &str) -> Option<u32> {
    let (h, m) = s.trim().split_once(':')?;
    let (h, m): (u32, u32) = (h.parse().ok()?, m.parse().ok()?);
    (h <= 24 && m < 60 && h * 60 + m <= 1440).then_some(h * 60 + m)
}

/// Read `course,day,start,end,place,teacher` (a header row is optional). Bad lines are listed by
/// line number; good lines still come through.
pub fn parse_csv(input: &str) -> ClassPreview {
    let input = input.trim_start_matches('\u{feff}');
    let first = input.lines().next().unwrap_or("");
    let sep = if first.contains(',') || !first.contains(';') {
        ','
    } else {
        ';'
    };
    let (mut rows, mut errors) = (Vec::new(), Vec::new());
    for (i, line) in input.lines().enumerate() {
        let n = (i + 1) as u32;
        if line.trim().is_empty() {
            continue;
        }
        let c = cells(line, sep);
        if i == 0 && c.first().is_some_and(|h| h.eq_ignore_ascii_case("course")) {
            continue;
        }
        let mut bad = |m: &str| {
            errors.push(LineError {
                line: n,
                message: m.into(),
            })
        };
        if c.len() < 4 {
            bad("Needs at least course, day, start and end.");
            continue;
        }
        let Some(day) = parse_day(&c[1]) else {
            bad("The day must be Mon, Tue, Wed, Thu, Fri, Sat or Sun.");
            continue;
        };
        let (Some(start), Some(end)) = (parse_time(&c[2]), parse_time(&c[3])) else {
            bad("Times look like 09:30 (24-hour).");
            continue;
        };
        if end <= start || start > 1439 {
            bad("The class must end after it starts.");
            continue;
        }
        if c[0].is_empty() || c[0].chars().count() > TITLE_MAX {
            bad("Give the class a course or name of up to 80 characters.");
            continue;
        }
        let get = |k: usize| c.get(k).cloned().unwrap_or_default();
        if get(4).chars().count() > TEXT_MAX || get(5).chars().count() > TEXT_MAX {
            bad("Place and teacher can be up to 40 characters.");
            continue;
        }
        rows.push(ClassDraft {
            course: c[0].clone(),
            day,
            start_min: start,
            end_min: end,
            place: get(4),
            teacher: get(5),
        });
    }
    ClassPreview { rows, errors }
}

fn quote(s: &str) -> String {
    if s.contains([',', '"', '\n']) {
        format!("\"{}\"", s.replace('"', "\"\""))
    } else {
        s.to_owned()
    }
}

fn hhmm(m: u32) -> String {
    format!("{:02}:{:02}", m / 60, m % 60)
}

/// The timetable as CSV, in the same columns the import reads.
pub async fn export_csv(db: &Database) -> Result<String> {
    let names: BTreeMap<String, String> = courses::list(db)
        .await?
        .into_iter()
        .map(|c| (c.id, c.name))
        .collect();
    let mut out = String::from("course,day,start,end,place,teacher\n");
    for c in list(db).await? {
        let name = c
            .course_id
            .as_ref()
            .and_then(|id| names.get(id))
            .unwrap_or(&c.title);
        out += &format!(
            "{},{},{},{},{},{}\n",
            quote(name),
            DAYS[c.day as usize % 7],
            hhmm(c.start_min),
            hhmm(c.end_min),
            quote(&c.place),
            quote(&c.teacher)
        );
    }
    Ok(out)
}

/// Import rows read from a file: courses that do not exist are created; with `replace` the old
/// timetable goes first. Returns how many classes were added.
pub async fn import(
    db: &Database,
    clock: &dyn Clock,
    rows: Vec<ClassDraft>,
    replace: bool,
) -> Result<u32> {
    let mut ids: BTreeMap<String, String> = BTreeMap::new();
    for r in &rows {
        if !ids.contains_key(&r.course) {
            let c = courses::create(db, clock, &r.course).await?;
            ids.insert(r.course.clone(), c.id);
        }
    }
    let now = clock.now_ms();
    db.write(move |tx| {
        if replace {
            tx.execute("DELETE FROM classes", [])?;
        }
        let mut n = 0;
        for r in rows {
            let input = ClassInput {
                course_id: ids.get(&r.course).cloned(),
                title: r.course,
                day: r.day,
                start_min: r.start_min,
                end_min: r.end_min,
                place: r.place,
                teacher: r.teacher,
                repeat: "weekly".into(),
                once_date: None,
                remind_min: None,
            };
            insert(tx, now, input)?;
            n += 1;
        }
        Ok((n, vec![]))
    })
    .await
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use chrono_tz::Tz;

    use super::*;
    use crate::bus::EventBus;
    use crate::clock::FakeClock;
    use crate::error::ErrorCode;

    fn setup() -> (tempfile::TempDir, Arc<Database>, FakeClock) {
        let dir = tempfile::tempdir().unwrap();
        let db =
            Arc::new(Database::open(&dir.path().join("pluto.db"), EventBus::default()).unwrap());
        (dir, db, FakeClock::new(1_793_188_800_000, Tz::UTC))
    }

    fn input(title: &str, day: u32, start: u32, end: u32) -> ClassInput {
        ClassInput {
            course_id: None,
            title: title.into(),
            day,
            start_min: start,
            end_min: end,
            place: String::new(),
            teacher: String::new(),
            repeat: "weekly".into(),
            once_date: None,
            remind_min: None,
        }
    }

    #[tokio::test]
    async fn a_class_is_saved_changed_and_deleted() {
        let (_d, db, clock) = setup();
        let c = add(&db, &clock, input(" Algorithms ", 0, 540, 630))
            .await
            .unwrap();
        assert_eq!(
            (c.title.as_str(), c.repeat.as_str()),
            ("Algorithms", "weekly")
        );
        let u = update(
            &db,
            &c.id,
            ClassInput {
                place: "C-201".into(),
                remind_min: Some(10),
                ..input("Algorithms", 1, 600, 690)
            },
        )
        .await
        .unwrap();
        assert_eq!(
            (u.day, u.start_min, u.place.as_str(), u.remind_min),
            (1, 600, "C-201", Some(10))
        );
        assert_eq!(list(&db).await.unwrap().len(), 1);
        delete(&db, &c.id).await.unwrap();
        assert_eq!(
            delete(&db, &c.id).await.unwrap_err().code,
            ErrorCode::NotFound
        );
    }

    #[tokio::test]
    async fn a_class_with_a_course_and_no_title_takes_the_course_name_and_survives_its_deletion() {
        let (_d, db, clock) = setup();
        let course = courses::create(&db, &clock, "Physics").await.unwrap();
        let c = add(
            &db,
            &clock,
            ClassInput {
                course_id: Some(course.id.clone()),
                ..input("", 2, 480, 540)
            },
        )
        .await
        .unwrap();
        assert_eq!(c.title, "Physics");
        courses::delete(&db, &course.id).await.unwrap();
        let left = list(&db).await.unwrap();
        assert_eq!(
            (
                left.len(),
                left[0].course_id.clone(),
                left[0].title.as_str()
            ),
            (1, None, "Physics")
        );
    }

    #[tokio::test]
    async fn bad_classes_are_refused_with_a_reason() {
        let (_d, db, clock) = setup();
        let bad = [
            input("x", 7, 480, 540),
            input("x", 0, 540, 540),
            input("x", 0, 600, 540),
            input("x", 0, 480, 1441),
            input("", 0, 480, 540),
            ClassInput {
                repeat: "daily".into(),
                ..input("x", 0, 480, 540)
            },
            ClassInput {
                repeat: "once".into(),
                ..input("x", 0, 480, 540)
            },
            ClassInput {
                remind_min: Some(5),
                ..input("x", 0, 480, 540)
            },
            ClassInput {
                place: "p".repeat(41),
                ..input("x", 0, 480, 540)
            },
        ];
        for b in bad {
            assert_eq!(
                add(&db, &clock, b).await.unwrap_err().code,
                ErrorCode::Validation
            );
        }
        let once = add(
            &db,
            &clock,
            ClassInput {
                repeat: "once".into(),
                once_date: Some("2026-11-20".into()),
                ..input("Exam review", 4, 600, 660)
            },
        )
        .await
        .unwrap();
        assert_eq!(once.once_date.as_deref(), Some("2026-11-20"));
        let weekly = add(
            &db,
            &clock,
            ClassInput {
                once_date: Some("2026-11-20".into()),
                ..input("x", 0, 480, 540)
            },
        )
        .await
        .unwrap();
        assert!(
            weekly.once_date.is_none(),
            "a date only means something for a one-off"
        );
    }

    #[test]
    fn csv_reads_names_days_and_times_and_reports_bad_lines_by_number() {
        let text = "course,day,start,end,place,teacher\nAlgorithms,Mon,9:30,10:30,C-201,Dr Rao\n\"Maths, applied\",Tuesday,13:00,14:00,,\nBroken,Funday,09:00,10:00\nLate,Wed,25:00,26:00\nBackwards,Thu,11:00,10:00\nOk,fri,08:00,09:00";
        let p = parse_csv(text);
        assert_eq!(p.rows.len(), 3);
        assert_eq!(
            (
                p.rows[0].day,
                p.rows[0].start_min,
                p.rows[0].end_min,
                p.rows[0].teacher.as_str()
            ),
            (0, 570, 630, "Dr Rao")
        );
        assert_eq!(
            (p.rows[1].course.as_str(), p.rows[1].day),
            ("Maths, applied", 1)
        );
        assert_eq!(p.rows[2].day, 4);
        assert_eq!(
            p.errors.iter().map(|e| e.line).collect::<Vec<_>>(),
            [4, 5, 6]
        );
        assert!(p.errors[0].message.contains("day"));
    }

    #[test]
    fn csv_without_a_header_semicolons_and_a_byte_order_mark_still_read() {
        let p = parse_csv("\u{feff}Maths;Mon;09:00;10:00;Room 1;Ms Ito");
        assert_eq!(p.rows.len(), 1);
        assert_eq!(p.rows[0].place, "Room 1");
        assert!(parse_csv("").rows.is_empty());
        assert_eq!(parse_csv("only,two").errors.len(), 1);
    }

    #[tokio::test]
    async fn export_then_import_gives_the_same_timetable() {
        let (_d, db, clock) = setup();
        let csv = "course,day,start,end,place,teacher\nAlgorithms,Mon,09:30,10:30,C-201,Dr Rao\n\"Maths, applied\",Tue,13:00,14:00,,\nLab,Fri,14:00,17:00,Lab 3,\n";
        let p = parse_csv(csv);
        assert_eq!(import(&db, &clock, p.rows, true).await.unwrap(), 3);
        let out = export_csv(&db).await.unwrap();
        assert_eq!(out, csv);
        // Importing the export again replaces, so nothing doubles.
        let again = parse_csv(&out);
        import(&db, &clock, again.rows, true).await.unwrap();
        assert_eq!(list(&db).await.unwrap().len(), 3);
        assert_eq!(
            courses::list(&db).await.unwrap().len(),
            3,
            "courses are made once"
        );
    }

    #[tokio::test]
    async fn adding_keeps_the_old_timetable_and_replacing_drops_it() {
        let (_d, db, clock) = setup();
        add(&db, &clock, input("Old", 0, 480, 540)).await.unwrap();
        let rows = parse_csv("New,Mon,10:00,11:00").rows;
        import(&db, &clock, rows.clone(), false).await.unwrap();
        assert_eq!(list(&db).await.unwrap().len(), 2);
        import(&db, &clock, rows, true).await.unwrap();
        let all = list(&db).await.unwrap();
        assert_eq!((all.len(), all[0].title.as_str()), (1, "New"));
    }
}
