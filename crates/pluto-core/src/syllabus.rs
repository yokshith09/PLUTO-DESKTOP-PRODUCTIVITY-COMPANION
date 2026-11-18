//! The Course page (owner design 2026-11-18): what a course holds. Topics hold subtopics, subtopics
//! hold short points (the exam notes the student copies into a paper notebook). An exam knows which
//! topics it covers; a course also has important dates (assignment, lab, quiz, project).
//!
//! The student sets a topic's status; Pluto never guesses it. Everything is read in one call
//! ([`detail`]) and changed with one command ([`apply`]), so the screen stays simple.

use chrono::NaiveDate;
use rusqlite::{params, OptionalExtension, Transaction};
use serde::{Deserialize, Serialize};

use crate::clock::Clock;
use crate::db::Database;
use crate::error::{AppError, Result};
use crate::ids::new_id;

pub const TITLE_MAX: usize = 100;
pub const POINT_MAX: usize = 300;
pub const SUBTITLE_MAX: usize = 60;
pub const PLACE_MAX: usize = 60;
/// How many colours the app offers a course (an index, never a raw value).
pub const COLORS: u32 = 8;
pub const KINDS: [&str; 5] = ["assignment", "lab", "quiz", "project", "other"];

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct CourseCard {
    pub id: String,
    pub name: String,
    pub subtitle: String,
    /// Index into the app's course colours, `0..COLORS`.
    pub color: u32,
    pub archived: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct Point {
    pub id: String,
    pub text: String,
    /// Written into the paper notebook.
    pub written: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct Subtopic {
    pub id: String,
    pub title: String,
    /// "I understand this".
    pub done: bool,
    pub points: Vec<Point>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct Topic {
    pub id: String,
    pub title: String,
    pub starred: bool,
    /// 0 To learn, 1 Learning, 2 Revise, 3 Exam-ready. Set by the student.
    pub status: u32,
    pub subtopics: Vec<Subtopic>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct CourseExam {
    pub id: String,
    pub title: String,
    pub on_date: String,
    /// `HH:MM`, or empty.
    pub at_time: String,
    pub place: String,
    /// The topics this exam covers; empty means all of them.
    pub topic_ids: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct CourseDate {
    pub id: String,
    pub title: String,
    pub on_date: String,
    /// One of [`KINDS`].
    pub kind: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct CourseSummary {
    /// Finished focus time on this course's tasks in the seven days ending today.
    #[cfg_attr(feature = "ts", ts(type = "number"))]
    pub focus_ms_week: i64,
    pub open_tasks: u32,
    pub notes: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct CourseDetail {
    pub card: CourseCard,
    pub topics: Vec<Topic>,
    pub exams: Vec<CourseExam>,
    pub dates: Vec<CourseDate>,
    pub summary: CourseSummary,
}

/// Every change the Course page can make.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "op", rename_all = "snake_case")]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export, rename = "SyllabusEdit"))]
pub enum Edit {
    CourseSet {
        id: String,
        subtitle: String,
        color: u32,
        archived: bool,
    },
    TopicAdd {
        course_id: String,
        title: String,
    },
    TopicSet {
        id: String,
        title: Option<String>,
        starred: Option<bool>,
        status: Option<u32>,
    },
    TopicDelete {
        id: String,
    },
    /// Swap with the neighbour above (`up`) or below.
    TopicMove {
        id: String,
        up: bool,
    },
    SubtopicAdd {
        topic_id: String,
        title: String,
    },
    SubtopicSet {
        id: String,
        title: Option<String>,
        done: Option<bool>,
    },
    SubtopicDelete {
        id: String,
    },
    PointAdd {
        subtopic_id: String,
        text: String,
    },
    PointSet {
        id: String,
        text: Option<String>,
        written: Option<bool>,
    },
    PointDelete {
        id: String,
    },
    /// Add (no `id`) or change an exam of the course.
    ExamSave {
        id: Option<String>,
        course_id: String,
        title: String,
        on_date: String,
        at_time: String,
        place: String,
        topic_ids: Vec<String>,
    },
    ExamDelete {
        id: String,
    },
    DateSave {
        id: Option<String>,
        course_id: String,
        title: String,
        on_date: String,
        kind: String,
    },
    DateDelete {
        id: String,
    },
}

fn title(field: &str, s: &str, what: &str) -> Result<String> {
    let s = s.trim();
    if s.is_empty() || s.chars().count() > TITLE_MAX {
        return Err(AppError::validation(
            field,
            format!("Give the {what} a name of up to {TITLE_MAX} characters."),
        ));
    }
    Ok(s.to_owned())
}

fn point_text(s: &str) -> Result<String> {
    let s = s.trim();
    if s.is_empty() || s.chars().count() > POINT_MAX {
        return Err(AppError::validation(
            "text",
            format!("A short note can be up to {POINT_MAX} characters."),
        ));
    }
    Ok(s.to_owned())
}

fn day(field: &str, s: &str) -> Result<String> {
    NaiveDate::parse_from_str(s, "%Y-%m-%d")
        .map(|d| d.to_string())
        .map_err(|_| AppError::validation(field, "Pick a date."))
}

fn clock_time(s: &str) -> Result<String> {
    let s = s.trim();
    if s.is_empty() {
        return Ok(String::new());
    }
    chrono::NaiveTime::parse_from_str(s, "%H:%M")
        .map(|t| t.format("%H:%M").to_string())
        .map_err(|_| AppError::validation("at_time", "Use a time like 10:00."))
}

/// A broken link (the course, topic or subtopic is gone) is "no longer exists", not a crash.
fn gone(e: rusqlite::Error) -> AppError {
    match e {
        rusqlite::Error::SqliteFailure(f, _)
            if f.code == rusqlite::ErrorCode::ConstraintViolation =>
        {
            AppError::not_found("That item no longer exists.")
        }
        other => other.into(),
    }
}

fn next_position(tx: &Transaction, sql: &str, parent: &str) -> Result<i64> {
    let max: Option<i64> = tx.query_row(sql, [parent], |r| r.get(0))?;
    Ok(max.map_or(0, |m| m + 1))
}

fn changed(n: usize) -> Result<()> {
    if n == 0 {
        Err(AppError::not_found("That item no longer exists."))
    } else {
        Ok(())
    }
}

/// The courses for the sidebar, active first, then archived, each by name.
pub async fn cards(db: &Database) -> Result<Vec<CourseCard>> {
    db.read(|conn| {
        let mut stmt = conn.prepare(
            "SELECT id, name, subtitle, color, archived FROM courses ORDER BY archived, name_folded",
        )?;
        let rows = stmt
            .query_map([], |r| {
                Ok(CourseCard {
                    id: r.get(0)?,
                    name: r.get(1)?,
                    subtitle: r.get(2)?,
                    color: r.get(3)?,
                    archived: r.get::<_, i64>(4)? != 0,
                })
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        Ok(rows)
    })
    .await
}

/// Everything the Course page shows for one course. `today` is `YYYY-MM-DD` (the week for the focus
/// time is the seven days ending on it).
pub async fn detail(db: &Database, id: &str, today: &str) -> Result<CourseDetail> {
    let end = NaiveDate::parse_from_str(today, "%Y-%m-%d")
        .map_err(|_| AppError::validation("today", "Pick a date."))?;
    let start = (end - chrono::Days::new(6)).to_string();
    let (id, end) = (id.to_owned(), end.to_string());
    db.read(move |conn| {
        let card = conn
            .query_row(
                "SELECT id, name, subtitle, color, archived FROM courses WHERE id = ?1",
                [&id],
                |r| {
                    Ok(CourseCard {
                        id: r.get(0)?,
                        name: r.get(1)?,
                        subtitle: r.get(2)?,
                        color: r.get(3)?,
                        archived: r.get::<_, i64>(4)? != 0,
                    })
                },
            )
            .optional()?
            .ok_or_else(|| AppError::not_found("That course no longer exists."))?;

        let mut topics: Vec<Topic> = conn
            .prepare("SELECT id, title, starred, status FROM topics WHERE course_id = ?1 ORDER BY position")?
            .query_map([&id], |r| {
                Ok(Topic {
                    id: r.get(0)?,
                    title: r.get(1)?,
                    starred: r.get::<_, i64>(2)? != 0,
                    status: r.get(3)?,
                    subtopics: vec![],
                })
            })?
            .collect::<rusqlite::Result<_>>()?;
        let mut subs = conn.prepare(
            "SELECT s.id, s.topic_id, s.title, s.done FROM subtopics s
               JOIN topics t ON t.id = s.topic_id WHERE t.course_id = ?1 ORDER BY s.position",
        )?;
        let subs: Vec<(String, Subtopic)> = subs
            .query_map([&id], |r| {
                Ok((
                    r.get(1)?,
                    Subtopic {
                        id: r.get(0)?,
                        title: r.get(2)?,
                        done: r.get::<_, i64>(3)? != 0,
                        points: vec![],
                    },
                ))
            })?
            .collect::<rusqlite::Result<_>>()?;
        let mut pts = conn.prepare(
            "SELECT p.id, p.subtopic_id, p.text, p.written FROM points p
               JOIN subtopics s ON s.id = p.subtopic_id JOIN topics t ON t.id = s.topic_id
              WHERE t.course_id = ?1 ORDER BY p.position",
        )?;
        let pts: Vec<(String, Point)> = pts
            .query_map([&id], |r| {
                Ok((
                    r.get(1)?,
                    Point {
                        id: r.get(0)?,
                        text: r.get(2)?,
                        written: r.get::<_, i64>(3)? != 0,
                    },
                ))
            })?
            .collect::<rusqlite::Result<_>>()?;
        let mut subs: Vec<(String, Subtopic)> = subs;
        for (sid, p) in pts {
            if let Some((_, s)) = subs.iter_mut().find(|(_, s)| s.id == sid) {
                s.points.push(p);
            }
        }
        for (tid, s) in subs {
            if let Some(t) = topics.iter_mut().find(|t| t.id == tid) {
                t.subtopics.push(s);
            }
        }

        let mut exams: Vec<CourseExam> = conn
            .prepare("SELECT id, title, on_date, at_time, place FROM exams WHERE course_id = ?1 ORDER BY on_date, at_time, title")?
            .query_map([&id], |r| {
                Ok(CourseExam {
                    id: r.get(0)?,
                    title: r.get(1)?,
                    on_date: r.get(2)?,
                    at_time: r.get(3)?,
                    place: r.get(4)?,
                    topic_ids: vec![],
                })
            })?
            .collect::<rusqlite::Result<_>>()?;
        let links: Vec<(String, String)> = conn
            .prepare("SELECT et.exam_id, et.topic_id FROM exam_topics et JOIN exams e ON e.id = et.exam_id WHERE e.course_id = ?1")?
            .query_map([&id], |r| Ok((r.get(0)?, r.get(1)?)))?
            .collect::<rusqlite::Result<_>>()?;
        for (eid, tid) in links {
            if let Some(e) = exams.iter_mut().find(|e| e.id == eid) {
                e.topic_ids.push(tid);
            }
        }

        let dates = conn
            .prepare("SELECT id, title, on_date, kind FROM course_dates WHERE course_id = ?1 ORDER BY on_date, title")?
            .query_map([&id], |r| {
                Ok(CourseDate {
                    id: r.get(0)?,
                    title: r.get(1)?,
                    on_date: r.get(2)?,
                    kind: r.get(3)?,
                })
            })?
            .collect::<rusqlite::Result<_>>()?;

        let summary = conn.query_row(
            "SELECT
               (SELECT COALESCE(SUM(MAX(f.ended_at - f.started_at - f.paused_ms, 0)), 0)
                  FROM focus_sessions f JOIN task_course tc ON tc.task_id = f.task_id
                 WHERE tc.course_id = ?1 AND f.kind = 'FOCUS' AND f.ended_at IS NOT NULL
                   AND f.local_date BETWEEN ?2 AND ?3),
               (SELECT COUNT(*) FROM tasks t JOIN task_course tc ON tc.task_id = t.id
                 WHERE tc.course_id = ?1 AND t.completed_at IS NULL),
               (SELECT COUNT(*) FROM notes n JOIN note_course nc ON nc.note_id = n.id
                 WHERE nc.course_id = ?1 AND n.archived = 0)",
            params![id, start, end],
            |r| {
                Ok(CourseSummary {
                    focus_ms_week: r.get(0)?,
                    open_tasks: r.get(1)?,
                    notes: r.get(2)?,
                })
            },
        )?;
        Ok(CourseDetail {
            card,
            topics,
            exams,
            dates,
            summary,
        })
    })
    .await
}

/// Make one change. Everything is checked first, so a refused change leaves nothing half done.
pub async fn apply(db: &Database, clock: &dyn Clock, edit: Edit) -> Result<()> {
    let now = clock.now_ms();
    // Check the words and dates before opening a write.
    let edit = match edit {
        Edit::CourseSet {
            id,
            subtitle,
            color,
            archived,
        } => {
            let subtitle = subtitle.trim().to_owned();
            if subtitle.chars().count() > SUBTITLE_MAX {
                return Err(AppError::validation(
                    "subtitle",
                    format!("The line under the name can be up to {SUBTITLE_MAX} characters."),
                ));
            }
            Edit::CourseSet {
                id,
                subtitle,
                color: color % COLORS,
                archived,
            }
        }
        Edit::TopicAdd {
            course_id,
            title: t,
        } => Edit::TopicAdd {
            course_id,
            title: title("title", &t, "topic")?,
        },
        Edit::TopicSet {
            id,
            title: t,
            starred,
            status,
        } => {
            if status.is_some_and(|s| s > 3) {
                return Err(AppError::validation(
                    "status",
                    "Pick one of the four states.",
                ));
            }
            Edit::TopicSet {
                id,
                title: t.map(|t| title("title", &t, "topic")).transpose()?,
                starred,
                status,
            }
        }
        Edit::SubtopicAdd { topic_id, title: t } => Edit::SubtopicAdd {
            topic_id,
            title: title("title", &t, "subtopic")?,
        },
        Edit::SubtopicSet { id, title: t, done } => Edit::SubtopicSet {
            id,
            title: t.map(|t| title("title", &t, "subtopic")).transpose()?,
            done,
        },
        Edit::PointAdd { subtopic_id, text } => Edit::PointAdd {
            subtopic_id,
            text: point_text(&text)?,
        },
        Edit::PointSet { id, text, written } => Edit::PointSet {
            id,
            text: text.map(|t| point_text(&t)).transpose()?,
            written,
        },
        Edit::ExamSave {
            id,
            course_id,
            title: t,
            on_date,
            at_time,
            place,
            topic_ids,
        } => {
            let place = place.trim().to_owned();
            if place.chars().count() > PLACE_MAX {
                return Err(AppError::validation(
                    "place",
                    format!("The place can be up to {PLACE_MAX} characters."),
                ));
            }
            Edit::ExamSave {
                id,
                course_id,
                title: title("title", &t, "exam")?,
                on_date: day("on_date", &on_date)?,
                at_time: clock_time(&at_time)?,
                place,
                topic_ids,
            }
        }
        Edit::DateSave {
            id,
            course_id,
            title: t,
            on_date,
            kind,
        } => {
            if !KINDS.contains(&kind.as_str()) {
                return Err(AppError::validation("kind", "Pick a type."));
            }
            Edit::DateSave {
                id,
                course_id,
                title: title("title", &t, "date")?,
                on_date: day("on_date", &on_date)?,
                kind,
            }
        }
        other => other,
    };
    db.write(move |tx| {
        run(tx, now, edit)?;
        Ok(((), vec![]))
    })
    .await
}

fn run(tx: &Transaction, now: i64, edit: Edit) -> Result<()> {
    match edit {
        Edit::CourseSet {
            id,
            subtitle,
            color,
            archived,
        } => changed(tx.execute(
            "UPDATE courses SET subtitle = ?1, color = ?2, archived = ?3 WHERE id = ?4",
            params![subtitle, color, archived, id],
        )?),
        Edit::TopicAdd { course_id, title } => {
            let pos = next_position(
                tx,
                "SELECT MAX(position) FROM topics WHERE course_id = ?1",
                &course_id,
            )?;
            tx.execute(
                "INSERT INTO topics (id, course_id, title, position, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
                params![new_id(), course_id, title, pos, now],
            )
            .map_err(gone)?;
            Ok(())
        }
        Edit::TopicSet {
            id,
            title,
            starred,
            status,
        } => changed(tx.execute(
            "UPDATE topics SET title = COALESCE(?1, title), starred = COALESCE(?2, starred),
                               status = COALESCE(?3, status) WHERE id = ?4",
            params![title, starred, status, id],
        )?),
        Edit::TopicDelete { id } => changed(tx.execute("DELETE FROM topics WHERE id = ?1", [id])?),
        Edit::TopicMove { id, up } => {
            let (course, pos): (String, i64) = tx
                .query_row(
                    "SELECT course_id, position FROM topics WHERE id = ?1",
                    [&id],
                    |r| Ok((r.get(0)?, r.get(1)?)),
                )
                .optional()?
                .ok_or_else(|| AppError::not_found("That item no longer exists."))?;
            let sql = if up {
                "SELECT id, position FROM topics WHERE course_id = ?1 AND position < ?2 ORDER BY position DESC LIMIT 1"
            } else {
                "SELECT id, position FROM topics WHERE course_id = ?1 AND position > ?2 ORDER BY position LIMIT 1"
            };
            let other: Option<(String, i64)> = tx
                .query_row(sql, params![course, pos], |r| Ok((r.get(0)?, r.get(1)?)))
                .optional()?;
            if let Some((oid, opos)) = other {
                tx.execute("UPDATE topics SET position = ?1 WHERE id = ?2", params![opos, id])?;
                tx.execute("UPDATE topics SET position = ?1 WHERE id = ?2", params![pos, oid])?;
            }
            Ok(())
        }
        Edit::SubtopicAdd { topic_id, title } => {
            let pos = next_position(
                tx,
                "SELECT MAX(position) FROM subtopics WHERE topic_id = ?1",
                &topic_id,
            )?;
            tx.execute(
                "INSERT INTO subtopics (id, topic_id, title, position) VALUES (?1, ?2, ?3, ?4)",
                params![new_id(), topic_id, title, pos],
            )
            .map_err(gone)?;
            Ok(())
        }
        Edit::SubtopicSet { id, title, done } => changed(tx.execute(
            "UPDATE subtopics SET title = COALESCE(?1, title), done = COALESCE(?2, done) WHERE id = ?3",
            params![title, done, id],
        )?),
        Edit::SubtopicDelete { id } => {
            changed(tx.execute("DELETE FROM subtopics WHERE id = ?1", [id])?)
        }
        Edit::PointAdd { subtopic_id, text } => {
            let pos = next_position(
                tx,
                "SELECT MAX(position) FROM points WHERE subtopic_id = ?1",
                &subtopic_id,
            )?;
            tx.execute(
                "INSERT INTO points (id, subtopic_id, text, position) VALUES (?1, ?2, ?3, ?4)",
                params![new_id(), subtopic_id, text, pos],
            )
            .map_err(gone)?;
            Ok(())
        }
        Edit::PointSet { id, text, written } => changed(tx.execute(
            "UPDATE points SET text = COALESCE(?1, text), written = COALESCE(?2, written) WHERE id = ?3",
            params![text, written, id],
        )?),
        Edit::PointDelete { id } => changed(tx.execute("DELETE FROM points WHERE id = ?1", [id])?),
        Edit::ExamSave {
            id,
            course_id,
            title,
            on_date,
            at_time,
            place,
            topic_ids,
        } => {
            let id = match id {
                Some(id) => {
                    changed(tx.execute(
                        "UPDATE exams SET title = ?1, on_date = ?2, at_time = ?3, place = ?4 WHERE id = ?5 AND course_id = ?6",
                        params![title, on_date, at_time, place, id, course_id],
                    )?)?;
                    id
                }
                None => {
                    let id = new_id();
                    tx.execute(
                        "INSERT INTO exams (id, course_id, title, on_date, at_time, place, created_at)
                         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                        params![id, course_id, title, on_date, at_time, place, now],
                    )
                    .map_err(gone)?;
                    id
                }
            };
            tx.execute("DELETE FROM exam_topics WHERE exam_id = ?1", [&id])?;
            for t in topic_ids {
                // Only topics of this course count; a stale id is ignored.
                tx.execute(
                    "INSERT OR IGNORE INTO exam_topics (exam_id, topic_id)
                     SELECT ?1, id FROM topics WHERE id = ?2 AND course_id = ?3",
                    params![id, t, course_id],
                )?;
            }
            Ok(())
        }
        Edit::DateSave {
            id,
            course_id,
            title,
            on_date,
            kind,
        } => {
            match id {
                Some(id) => changed(tx.execute(
                    "UPDATE course_dates SET title = ?1, on_date = ?2, kind = ?3 WHERE id = ?4 AND course_id = ?5",
                    params![title, on_date, kind, id, course_id],
                )?)?,
                None => {
                    tx.execute(
                        "INSERT INTO course_dates (id, course_id, title, on_date, kind, created_at)
                         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                        params![new_id(), course_id, title, on_date, kind, now],
                    )
                    .map_err(gone)?;
                }
            }
            Ok(())
        }
        Edit::ExamDelete { id } => changed(tx.execute("DELETE FROM exams WHERE id = ?1", [id])?),
        Edit::DateDelete { id } => {
            changed(tx.execute("DELETE FROM course_dates WHERE id = ?1", [id])?)
        }
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use chrono_tz::Tz;

    use super::*;
    use crate::bus::EventBus;
    use crate::clock::FakeClock;
    use crate::courses;
    use crate::error::ErrorCode;

    fn setup() -> (tempfile::TempDir, Arc<Database>, FakeClock) {
        let dir = tempfile::tempdir().unwrap();
        let db =
            Arc::new(Database::open(&dir.path().join("pluto.db"), EventBus::default()).unwrap());
        (dir, db, FakeClock::new(1_793_188_800_000, Tz::UTC))
    }

    async fn course(db: &Database, clock: &FakeClock) -> String {
        courses::create(db, clock, "Algorithms").await.unwrap().id
    }

    async fn topic(db: &Database, clock: &FakeClock, c: &str, t: &str) -> String {
        apply(
            db,
            clock,
            Edit::TopicAdd {
                course_id: c.into(),
                title: t.into(),
            },
        )
        .await
        .unwrap();
        detail(db, c, "2026-10-28")
            .await
            .unwrap()
            .topics
            .into_iter()
            .find(|x| x.title == t)
            .unwrap()
            .id
    }

    #[tokio::test]
    async fn a_new_course_has_defaults_and_cards_put_archived_last() {
        let (_d, db, clock) = setup();
        let a = course(&db, &clock).await;
        let b = courses::create(&db, &clock, "Art").await.unwrap().id;
        apply(
            &db,
            &clock,
            Edit::CourseSet {
                id: a.clone(),
                subtitle: " CSE • 5th Semester ".into(),
                color: 11,
                archived: true,
            },
        )
        .await
        .unwrap();
        let cards = cards(&db).await.unwrap();
        assert_eq!(cards[0].id, b, "archived goes last");
        assert!(!cards[0].archived && cards[0].color == 0 && cards[0].subtitle.is_empty());
        assert_eq!(cards[1].subtitle, "CSE • 5th Semester");
        assert_eq!(cards[1].color, 3, "a colour index wraps into the palette");
    }

    #[tokio::test]
    async fn topics_subtopics_and_points_nest_in_order() {
        let (_d, db, clock) = setup();
        let c = course(&db, &clock).await;
        let t1 = topic(&db, &clock, &c, "B-Trees").await;
        let _t2 = topic(&db, &clock, &c, "Proofs").await;
        apply(
            &db,
            &clock,
            Edit::SubtopicAdd {
                topic_id: t1.clone(),
                title: "Insert".into(),
            },
        )
        .await
        .unwrap();
        let d = detail(&db, &c, "2026-10-28").await.unwrap();
        let s = d.topics[0].subtopics[0].id.clone();
        for text in ["split the node", "median goes up"] {
            apply(
                &db,
                &clock,
                Edit::PointAdd {
                    subtopic_id: s.clone(),
                    text: text.into(),
                },
            )
            .await
            .unwrap();
        }
        let d = detail(&db, &c, "2026-10-28").await.unwrap();
        assert_eq!(
            d.topics
                .iter()
                .map(|t| t.title.as_str())
                .collect::<Vec<_>>(),
            ["B-Trees", "Proofs"]
        );
        let pts = &d.topics[0].subtopics[0].points;
        assert_eq!(
            pts.iter().map(|p| p.text.as_str()).collect::<Vec<_>>(),
            ["split the node", "median goes up"]
        );
        assert!(pts.iter().all(|p| !p.written));
    }

    #[tokio::test]
    async fn the_student_sets_status_star_and_tick_and_nothing_else_does() {
        let (_d, db, clock) = setup();
        let c = course(&db, &clock).await;
        let t = topic(&db, &clock, &c, "Max Flow").await;
        apply(
            &db,
            &clock,
            Edit::TopicSet {
                id: t.clone(),
                title: None,
                starred: Some(true),
                status: Some(3),
            },
        )
        .await
        .unwrap();
        apply(
            &db,
            &clock,
            Edit::SubtopicAdd {
                topic_id: t.clone(),
                title: "Cuts".into(),
            },
        )
        .await
        .unwrap();
        let s = detail(&db, &c, "2026-10-28").await.unwrap().topics[0].subtopics[0]
            .id
            .clone();
        apply(
            &db,
            &clock,
            Edit::SubtopicSet {
                id: s.clone(),
                title: None,
                done: Some(true),
            },
        )
        .await
        .unwrap();
        apply(
            &db,
            &clock,
            Edit::PointAdd {
                subtopic_id: s,
                text: "min cut = max flow".into(),
            },
        )
        .await
        .unwrap();
        let d = detail(&db, &c, "2026-10-28").await.unwrap();
        let tp = &d.topics[0];
        assert!(tp.starred && tp.status == 3 && tp.title == "Max Flow");
        assert!(tp.subtopics[0].done);
        let p = tp.subtopics[0].points[0].id.clone();
        apply(
            &db,
            &clock,
            Edit::PointSet {
                id: p,
                text: None,
                written: Some(true),
            },
        )
        .await
        .unwrap();
        assert!(
            detail(&db, &c, "2026-10-28").await.unwrap().topics[0].subtopics[0].points[0].written
        );
        let err = apply(
            &db,
            &clock,
            Edit::TopicSet {
                id: t,
                title: None,
                starred: None,
                status: Some(4),
            },
        )
        .await
        .unwrap_err();
        assert_eq!(err.code, ErrorCode::Validation);
    }

    #[tokio::test]
    async fn moving_a_topic_swaps_it_with_its_neighbour_and_stops_at_the_ends() {
        let (_d, db, clock) = setup();
        let c = course(&db, &clock).await;
        let _a = topic(&db, &clock, &c, "A").await;
        let _b = topic(&db, &clock, &c, "B").await;
        let cc = topic(&db, &clock, &c, "C").await;
        apply(
            &db,
            &clock,
            Edit::TopicMove {
                id: cc.clone(),
                up: true,
            },
        )
        .await
        .unwrap();
        apply(
            &db,
            &clock,
            Edit::TopicMove {
                id: cc.clone(),
                up: true,
            },
        )
        .await
        .unwrap();
        apply(&db, &clock, Edit::TopicMove { id: cc, up: true })
            .await
            .unwrap(); // already first
        let names: Vec<_> = detail(&db, &c, "2026-10-28")
            .await
            .unwrap()
            .topics
            .into_iter()
            .map(|t| t.title)
            .collect();
        assert_eq!(names, ["C", "A", "B"]);
    }

    #[tokio::test]
    async fn words_are_checked_and_a_point_is_short() {
        let (_d, db, clock) = setup();
        let c = course(&db, &clock).await;
        let t = topic(&db, &clock, &c, "T").await;
        for bad in ["", "   ", &"x".repeat(101)] {
            let e = apply(
                &db,
                &clock,
                Edit::TopicAdd {
                    course_id: c.clone(),
                    title: bad.into(),
                },
            )
            .await
            .unwrap_err();
            assert_eq!(e.code, ErrorCode::Validation);
        }
        apply(
            &db,
            &clock,
            Edit::SubtopicAdd {
                topic_id: t,
                title: "S".into(),
            },
        )
        .await
        .unwrap();
        let s = detail(&db, &c, "2026-10-28").await.unwrap().topics[0].subtopics[0]
            .id
            .clone();
        let e = apply(
            &db,
            &clock,
            Edit::PointAdd {
                subtopic_id: s.clone(),
                text: "y".repeat(301),
            },
        )
        .await
        .unwrap_err();
        assert_eq!(e.code, ErrorCode::Validation);
        apply(
            &db,
            &clock,
            Edit::PointAdd {
                subtopic_id: s,
                text: "y".repeat(300),
            },
        )
        .await
        .unwrap();
    }

    #[tokio::test]
    async fn an_exam_remembers_time_place_and_only_this_courses_topics() {
        let (_d, db, clock) = setup();
        let c = course(&db, &clock).await;
        let other = courses::create(&db, &clock, "Other").await.unwrap().id;
        let t = topic(&db, &clock, &c, "Graphs").await;
        let foreign = topic(&db, &clock, &other, "Elsewhere").await;
        apply(
            &db,
            &clock,
            Edit::ExamSave {
                id: None,
                course_id: c.clone(),
                title: "Midterm".into(),
                on_date: "2026-11-16".into(),
                at_time: "10:00".into(),
                place: " C-201 ".into(),
                topic_ids: vec![t.clone(), foreign],
            },
        )
        .await
        .unwrap();
        let e = detail(&db, &c, "2026-10-28").await.unwrap().exams.remove(0);
        assert_eq!((e.at_time.as_str(), e.place.as_str()), ("10:00", "C-201"));
        assert_eq!(
            e.topic_ids,
            vec![t.clone()],
            "a topic of another course is ignored"
        );
        apply(
            &db,
            &clock,
            Edit::ExamSave {
                id: Some(e.id.clone()),
                course_id: c.clone(),
                title: "Midterm 2".into(),
                on_date: "2026-11-17".into(),
                at_time: String::new(),
                place: String::new(),
                topic_ids: vec![],
            },
        )
        .await
        .unwrap();
        let e = detail(&db, &c, "2026-10-28").await.unwrap().exams.remove(0);
        assert!(e.topic_ids.is_empty() && e.title == "Midterm 2" && e.at_time.is_empty());
        let bad = apply(
            &db,
            &clock,
            Edit::ExamSave {
                id: None,
                course_id: c,
                title: "X".into(),
                on_date: "2026-11-16".into(),
                at_time: "25:99".into(),
                place: String::new(),
                topic_ids: vec![],
            },
        )
        .await
        .unwrap_err();
        assert_eq!(bad.code, ErrorCode::Validation);
    }

    #[tokio::test]
    async fn important_dates_have_a_type_and_can_be_deleted() {
        let (_d, db, clock) = setup();
        let c = course(&db, &clock).await;
        apply(
            &db,
            &clock,
            Edit::DateSave {
                id: None,
                course_id: c.clone(),
                title: "Assignment 3".into(),
                on_date: "2026-11-02".into(),
                kind: "assignment".into(),
            },
        )
        .await
        .unwrap();
        let bad = apply(
            &db,
            &clock,
            Edit::DateSave {
                id: None,
                course_id: c.clone(),
                title: "x".into(),
                on_date: "2026-11-02".into(),
                kind: "party".into(),
            },
        )
        .await
        .unwrap_err();
        assert_eq!(bad.code, ErrorCode::Validation);
        let d = detail(&db, &c, "2026-10-28").await.unwrap().dates.remove(0);
        assert_eq!(d.kind, "assignment");
        apply(&db, &clock, Edit::DateDelete { id: d.id.clone() })
            .await
            .unwrap();
        assert!(detail(&db, &c, "2026-10-28")
            .await
            .unwrap()
            .dates
            .is_empty());
        let gone = apply(&db, &clock, Edit::DateDelete { id: d.id })
            .await
            .unwrap_err();
        assert_eq!(gone.code, ErrorCode::NotFound);
    }

    #[tokio::test]
    async fn deleting_a_topic_or_course_removes_what_is_under_it() {
        let (_d, db, clock) = setup();
        let c = course(&db, &clock).await;
        let t = topic(&db, &clock, &c, "T").await;
        apply(
            &db,
            &clock,
            Edit::SubtopicAdd {
                topic_id: t.clone(),
                title: "S".into(),
            },
        )
        .await
        .unwrap();
        let s = detail(&db, &c, "2026-10-28").await.unwrap().topics[0].subtopics[0]
            .id
            .clone();
        apply(
            &db,
            &clock,
            Edit::PointAdd {
                subtopic_id: s,
                text: "p".into(),
            },
        )
        .await
        .unwrap();
        apply(&db, &clock, Edit::TopicDelete { id: t })
            .await
            .unwrap();
        assert!(detail(&db, &c, "2026-10-28")
            .await
            .unwrap()
            .topics
            .is_empty());
        let left: i64 = db
            .read(|conn| {
                Ok(conn.query_row(
                    "SELECT (SELECT COUNT(*) FROM subtopics) + (SELECT COUNT(*) FROM points)",
                    [],
                    |r| r.get(0),
                )?)
            })
            .await
            .unwrap();
        assert_eq!(left, 0);
        courses::delete(&db, &c).await.unwrap();
        assert_eq!(
            detail(&db, &c, "2026-10-28").await.unwrap_err().code,
            ErrorCode::NotFound
        );
    }

    #[tokio::test]
    async fn the_summary_counts_open_tasks_and_notes_of_the_course() {
        use crate::notes::{self, NoteInput};
        use crate::tasks;
        let (_d, db, clock) = setup();
        let c = course(&db, &clock).await;
        let t = tasks::quick_add(&db, &clock, "Problem set").await.unwrap();
        let n = notes::create(
            &db,
            &clock,
            NoteInput {
                title: "Lecture 1".into(),
                ..Default::default()
            },
        )
        .await
        .unwrap();
        courses::set_task_course(&db, &t.id, Some(c.clone()))
            .await
            .unwrap();
        courses::set_note_course(&db, &n.id, Some(c.clone()))
            .await
            .unwrap();
        let s = detail(&db, &c, "2026-10-28").await.unwrap().summary;
        assert_eq!((s.focus_ms_week, s.open_tasks, s.notes), (0, 1, 1));
    }
}
