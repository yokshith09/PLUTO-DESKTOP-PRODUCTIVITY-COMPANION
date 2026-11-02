//! The change tools (P4.1c): what an assistant may change in Pluto, each with a way back. Every
//! change returns an [`Undo`] the Assistants page offers next to it. Nothing here deletes for
//! good: a note an assistant made goes to the Bin when undone; tasks are cancelled, not deleted.
//! Never the diary, never settings (those wait for the Allow card).

use chrono::{NaiveDate, NaiveDateTime, TimeZone};
use rmcp::schemars;
use serde::{Deserialize, Serialize};

use crate::notes::{self, NoteInput, NotePatch};
use crate::reminders::{self, ReminderInput};
use crate::tasks::{self, Priority, TaskInput, TaskPatch, TaskStatus};

use super::read::Data;

/// One field of a task as it was before an assistant changed it.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "field", content = "was", rename_all = "snake_case")]
pub enum TaskField {
    Title(String),
    Description(String),
    Priority(Option<Priority>),
    Planned(Option<NaiveDate>),
    Due(Option<NaiveDate>),
}

fn patch_of(fields: &[TaskField]) -> TaskPatch {
    let mut p = TaskPatch::default();
    for f in fields {
        match f {
            TaskField::Title(t) => p.title = Some(t.clone()),
            TaskField::Description(d) => p.description = Some(d.clone()),
            TaskField::Priority(v) => p.priority = Some(*v),
            TaskField::Planned(v) => p.planned_date = Some(*v),
            TaskField::Due(v) => p.due_date = Some(*v),
        }
    }
    p
}

/// How to put one change back. Saved with the change list, so Undo works after a restart.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Undo {
    /// A task the assistant added: cancelled, then removed.
    TaskAdded { id: String },
    /// A task the assistant edited: these fields go back.
    TaskEdited { id: String, before: Vec<TaskField> },
    /// A task the assistant finished: open again.
    TaskCompleted { id: String },
    /// A reminder the assistant added: removed.
    ReminderAdded { id: String },
    /// A note the assistant made: to the Bin.
    NoteAdded { id: String },
    /// Text the assistant added to a note: the note's text as it was.
    NoteAppended { id: String, body: String },
    /// A reminder the assistant deleted: back from the Bin.
    ReminderBinned { id: String },
    /// A meeting the assistant deleted: back from the Bin.
    MeetingBinned { id: String },
    /// A setting the person allowed: back to what it was.
    SettingChanged {
        key: String,
        before: serde_json::Value,
    },
}

/// What a change did, in words, and how to undo it (`None` when it cannot be undone).
#[derive(Debug, Clone, PartialEq)]
pub struct Change {
    pub summary: String,
    pub undo: Option<Undo>,
}

/// The answer an assistant gets back.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, schemars::JsonSchema)]
pub struct Done {
    /// The id of what was made or changed.
    pub id: String,
    /// What happened, in words.
    pub summary: String,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct TaskAddArgs {
    pub title: String,
    #[serde(default)]
    pub description: Option<String>,
    /// HIGH, MEDIUM or LOW.
    #[serde(default)]
    pub priority: Option<String>,
    /// The day to do it (YYYY-MM-DD). Leave out for no day.
    #[serde(default)]
    pub planned: Option<String>,
    /// The day it is due (YYYY-MM-DD).
    #[serde(default)]
    pub due: Option<String>,
    #[serde(default)]
    pub project: Option<String>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct TaskUpdateArgs {
    pub id: String,
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    /// HIGH, MEDIUM, LOW, or "" for none.
    #[serde(default)]
    pub priority: Option<String>,
    /// YYYY-MM-DD, or "" for no day.
    #[serde(default)]
    pub planned: Option<String>,
    /// YYYY-MM-DD, or "" for no due day.
    #[serde(default)]
    pub due: Option<String>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct ReminderAddArgs {
    pub title: String,
    /// When, in the person's local time: "YYYY-MM-DD HH:MM".
    pub at: String,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct NoteAddArgs {
    pub title: String,
    pub body: String,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct NoteAppendArgs {
    pub id: String,
    /// Added on a new line at the end of the note.
    pub text: String,
}

fn words(e: crate::error::AppError) -> String {
    e.message
}

fn date(field: &str, text: &str) -> Result<Option<NaiveDate>, String> {
    let text = text.trim();
    if text.is_empty() {
        return Ok(None);
    }
    NaiveDate::parse_from_str(text, "%Y-%m-%d")
        .map(Some)
        .map_err(|_| format!("`{field}` must be a day like 2026-11-02."))
}

fn priority(text: &str) -> Result<Option<Priority>, String> {
    match text.trim().to_ascii_uppercase().as_str() {
        "" => Ok(None),
        "HIGH" => Ok(Some(Priority::High)),
        "MEDIUM" => Ok(Some(Priority::Medium)),
        "LOW" => Ok(Some(Priority::Low)),
        _ => Err("`priority` must be HIGH, MEDIUM or LOW.".into()),
    }
}

fn done(id: &str, summary: String, undo: Option<Undo>) -> (Done, Change) {
    (
        Done {
            id: id.to_owned(),
            summary: summary.clone(),
        },
        Change { summary, undo },
    )
}

pub async fn task_add(data: &Data, a: TaskAddArgs) -> Result<(Done, Change), String> {
    let input = TaskInput {
        title: a.title,
        description: a.description.unwrap_or_default(),
        priority: priority(a.priority.as_deref().unwrap_or(""))?,
        project: a.project.filter(|p| !p.trim().is_empty()),
        planned_date: date("planned", a.planned.as_deref().unwrap_or(""))?,
        due_date: date("due", a.due.as_deref().unwrap_or(""))?,
        note_id: None,
    };
    let t = tasks::create(&data.db, &*data.clock, input)
        .await
        .map_err(words)?;
    Ok(done(
        &t.id,
        format!("Added the task \"{}\".", t.title),
        Some(Undo::TaskAdded { id: t.id.clone() }),
    ))
}

pub async fn task_update(data: &Data, a: TaskUpdateArgs) -> Result<(Done, Change), String> {
    let before = tasks::get(&data.db, a.id.trim()).await.map_err(words)?;
    let mut patch = TaskPatch::default();
    let mut back = Vec::new();
    if let Some(t) = a.title {
        patch.title = Some(t);
        back.push(TaskField::Title(before.title.clone()));
    }
    if let Some(d) = a.description {
        patch.description = Some(d);
        back.push(TaskField::Description(before.description.clone()));
    }
    if let Some(p) = a.priority {
        patch.priority = Some(priority(&p)?);
        back.push(TaskField::Priority(before.priority));
    }
    if let Some(p) = a.planned {
        patch.planned_date = Some(date("planned", &p)?);
        back.push(TaskField::Planned(before.planned_date));
    }
    if let Some(d) = a.due {
        patch.due_date = Some(date("due", &d)?);
        back.push(TaskField::Due(before.due_date));
    }
    if patch == TaskPatch::default() {
        return Err(
            "Nothing to change: give a title, description, priority, planned or due.".into(),
        );
    }
    let t = tasks::update(&data.db, &*data.clock, &before.id, patch)
        .await
        .map_err(words)?;
    Ok(done(
        &t.id,
        format!("Changed the task \"{}\".", t.title),
        Some(Undo::TaskEdited {
            id: t.id.clone(),
            before: back,
        }),
    ))
}

/// Marks a task done (undo opens it again).
pub async fn task_complete(data: &Data, id: &str) -> Result<(Done, Change), String> {
    let t = tasks::transition(&data.db, &*data.clock, id.trim(), TaskStatus::Completed)
        .await
        .map_err(words)?;
    Ok(done(
        &t.id,
        format!("Marked \"{}\" done.", t.title),
        Some(Undo::TaskCompleted { id: t.id.clone() }),
    ))
}

/// Parses "YYYY-MM-DD HH:MM" in the person's time zone.
fn local_time(data: &Data, text: &str) -> Result<i64, String> {
    let naive = NaiveDateTime::parse_from_str(text.trim(), "%Y-%m-%d %H:%M")
        .map_err(|_| "`at` must be a local time like 2026-11-02 17:30.".to_string())?;
    data.clock
        .tz()
        .from_local_datetime(&naive)
        .earliest()
        .map(|t| t.timestamp_millis())
        .ok_or_else(|| "That time does not exist where the person is.".to_string())
}

pub async fn reminder_add(data: &Data, a: ReminderAddArgs) -> Result<(Done, Change), String> {
    let at = local_time(data, &a.at)?;
    if at <= data.clock.now_ms() {
        return Err("That time has passed. Pick a time in the future.".into());
    }
    let r = reminders::create(
        &data.db,
        &*data.clock,
        ReminderInput {
            title: a.title,
            remind_at: at,
            note_id: None,
            task_id: None,
            lead_min: None,
            sound: None,
        },
    )
    .await
    .map_err(words)?;
    Ok(done(
        &r.id,
        format!("Added a reminder \"{}\" at {}.", r.title, a.at.trim()),
        Some(Undo::ReminderAdded { id: r.id.clone() }),
    ))
}

pub async fn note_add(data: &Data, a: NoteAddArgs) -> Result<(Done, Change), String> {
    let n = notes::create(
        &data.db,
        &*data.clock,
        NoteInput {
            title: a.title,
            body: a.body,
            ..NoteInput::default()
        },
    )
    .await
    .map_err(words)?;
    Ok(done(
        &n.id,
        format!("Made the note \"{}\".", n.title),
        Some(Undo::NoteAdded { id: n.id.clone() }),
    ))
}

pub async fn note_append(data: &Data, a: NoteAppendArgs) -> Result<(Done, Change), String> {
    let id = a.id.trim();
    if notes::in_bin(&data.db, id).await.unwrap_or(true) {
        return Err("There is no note with that id.".into());
    }
    let before = notes::get(&data.db, id).await.map_err(words)?;
    if a.text.trim().is_empty() {
        return Err("Give the text to add.".into());
    }
    let body = if before.body.is_empty() {
        a.text.clone()
    } else {
        format!("{}\n{}", before.body, a.text)
    };
    let n = notes::update(
        &data.db,
        &*data.clock,
        id,
        NotePatch {
            body: Some(body),
            ..NotePatch::default()
        },
    )
    .await
    .map_err(words)?;
    Ok(done(
        &n.id,
        format!("Added to the note \"{}\".", n.title),
        Some(Undo::NoteAppended {
            id: n.id.clone(),
            body: before.body,
        }),
    ))
}

/// Moves a reminder to the Bin (restorable for 30 days; undo brings it back).
pub async fn reminder_delete(data: &Data, id: &str) -> Result<(Done, Change), String> {
    let id = id.trim();
    let title = reminders::list(&data.db, true)
        .await
        .map_err(words)?
        .into_iter()
        .find(|r| r.id == id)
        .map(|r| r.title)
        .ok_or("There is no reminder with that id.")?;
    reminders::delete(&data.db, &*data.clock, id)
        .await
        .map_err(words)?;
    Ok(done(
        id,
        format!("Moved the reminder \"{title}\" to the Bin."),
        Some(Undo::ReminderBinned { id: id.to_owned() }),
    ))
}

/// Moves a meeting to the Bin (restorable for 30 days; undo brings it back).
pub async fn meeting_delete(data: &Data, id: &str) -> Result<(Done, Change), String> {
    let id = id.trim();
    let m = crate::meetings::get(&data.db, id)
        .await
        .map_err(|_| "There is no meeting with that id.".to_string())?;
    crate::meetings::delete(&data.db, &*data.clock, id)
        .await
        .map_err(words)?;
    Ok(done(
        id,
        format!("Moved the meeting \"{}\" to the Bin.", m.title),
        Some(Undo::MeetingBinned { id: id.to_owned() }),
    ))
}

/// Puts one change back. Refused (with words) when the thing has changed since in a way that
/// makes undoing unsafe, for example the task was already finished by the person.
pub async fn undo(data: &Data, undo: &Undo) -> Result<String, String> {
    let (db, clock) = (&data.db, &*data.clock);
    match undo {
        Undo::TaskAdded { id } => {
            let t = tasks::get(db, id).await.map_err(words)?;
            if t.status != TaskStatus::Completed && t.status != TaskStatus::Cancelled {
                tasks::transition(db, clock, id, TaskStatus::Cancelled)
                    .await
                    .map_err(words)?;
            }
            tasks::delete(db, clock, id).await.map_err(words)?;
            Ok(format!("Removed the task \"{}\".", t.title))
        }
        Undo::TaskEdited { id, before } => {
            let t = tasks::update(db, clock, id, patch_of(before))
                .await
                .map_err(words)?;
            Ok(format!("Put the task \"{}\" back.", t.title))
        }
        Undo::TaskCompleted { id } => {
            let t = tasks::transition(db, clock, id, TaskStatus::Planned)
                .await
                .map_err(words)?;
            Ok(format!("Opened \"{}\" again.", t.title))
        }
        Undo::ReminderAdded { id } => {
            reminders::delete(db, clock, id).await.map_err(words)?;
            Ok("Removed the reminder.".into())
        }
        Undo::NoteAdded { id } => {
            let n = notes::delete(db, clock, id).await.map_err(words)?;
            Ok(format!("Moved the note \"{}\" to the Bin.", n.title))
        }
        Undo::ReminderBinned { id } => {
            let r = reminders::restore(db, clock, id).await.map_err(words)?;
            Ok(format!("Brought the reminder \"{}\" back.", r.title))
        }
        Undo::MeetingBinned { id } => {
            let m = crate::meetings::restore(db, clock, id)
                .await
                .map_err(words)?;
            Ok(format!("Brought the meeting \"{}\" back.", m.title))
        }
        Undo::SettingChanged { key, before } => {
            let settings = data
                .settings
                .as_ref()
                .ok_or("Pluto's settings are not open yet.")?;
            settings.set(key, before.clone()).await.map_err(words)?;
            Ok("Put the setting back.".into())
        }
        Undo::NoteAppended { id, body } => {
            let n = notes::update(
                db,
                clock,
                id,
                NotePatch {
                    body: Some(body.clone()),
                    ..NotePatch::default()
                },
            )
            .await
            .map_err(words)?;
            Ok(format!("Put the note \"{}\" back.", n.title))
        }
    }
}
