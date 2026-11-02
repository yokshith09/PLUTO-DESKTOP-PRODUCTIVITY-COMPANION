//! The read tools' answers (P4.1b): today's plan, task lists, one task, note search, one note.
//! Read only, and never the diary: the diary is encrypted with a key these functions never see,
//! and nothing here touches its tables.

use std::sync::Arc;

use rmcp::schemars;
use serde::{Deserialize, Serialize};

use crate::clock::Clock;
use crate::db::Database;
use crate::error::ErrorCode;
use crate::notes::{self, NoteSummary};
use crate::tasks::{self, Task, TaskFilters, TaskRow, TaskView};

/// Pluto's data, as the read tools see it.
#[derive(Clone)]
pub struct Data {
    pub db: Arc<Database>,
    pub clock: Arc<dyn Clock>,
}

/// Most rows one answer carries.
pub const LIST_MAX: usize = 50;
/// Longest note body one answer carries, in characters.
pub const BODY_MAX: usize = 20_000;

/// One task in a list.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, schemars::JsonSchema)]
pub struct TaskBrief {
    pub id: String,
    pub title: String,
    /// PENDING, IN_PROGRESS, COMPLETED or CANCELLED (and the other states Pluto uses).
    pub status: String,
    /// HIGH, MEDIUM or LOW.
    pub priority: Option<String>,
    pub project: Option<String>,
    /// The day it is planned for (YYYY-MM-DD).
    pub planned: Option<String>,
    /// The day it is due (YYYY-MM-DD).
    pub due: Option<String>,
    pub overdue: bool,
    pub starred: bool,
}

/// One task with its description and links.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, schemars::JsonSchema)]
pub struct TaskDetail {
    #[serde(flatten)]
    pub task: TaskBrief,
    pub description: String,
    /// The links shown next to the task.
    pub links: Vec<String>,
    /// The note this task belongs to, if any (read it with note_get).
    pub note_id: Option<String>,
}

/// A list of tasks.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, schemars::JsonSchema)]
pub struct TaskList {
    pub tasks: Vec<TaskBrief>,
    /// True when there were more than were sent.
    pub more: bool,
}

/// Today's plan.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, schemars::JsonSchema)]
pub struct Today {
    /// Today's date where the person is (YYYY-MM-DD).
    pub date: String,
    /// Open tasks for today, overdue ones and ones in progress, in Pluto's order.
    pub tasks: Vec<TaskBrief>,
    pub more: bool,
}

/// One note in search results.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, schemars::JsonSchema)]
pub struct NoteBrief {
    pub id: String,
    pub title: String,
    /// The start of the note.
    pub excerpt: String,
    pub labels: Vec<String>,
    pub pinned: bool,
    pub archived: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, schemars::JsonSchema)]
pub struct NoteHits {
    pub notes: Vec<NoteBrief>,
}

/// One whole note.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, schemars::JsonSchema)]
pub struct NoteFull {
    pub id: String,
    pub title: String,
    pub body: String,
    /// True when the body was longer than Pluto sends and was cut.
    pub cut: bool,
    pub labels: Vec<String>,
    pub project: Option<String>,
    pub archived: bool,
}

/// Which tasks `tasks_list` returns.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum Which {
    #[default]
    Today,
    /// The next 7 days.
    Upcoming,
    /// Open tasks with no day yet.
    Pending,
    /// Finished tasks, newest first.
    Completed,
    /// Everything, finished last.
    All,
}

fn upper(v: impl Serialize) -> String {
    serde_json::to_value(v)
        .ok()
        .and_then(|v| v.as_str().map(str::to_owned))
        .unwrap_or_default()
}

fn brief(task: &Task, overdue: bool) -> TaskBrief {
    TaskBrief {
        id: task.id.clone(),
        title: task.title.clone(),
        status: upper(task.status),
        priority: task.priority.map(upper),
        project: task.project.clone(),
        planned: task.planned_date.map(|d| d.to_string()),
        due: task.due_date.map(|d| d.to_string()),
        overdue,
        starred: task.starred,
    }
}

fn cap(rows: Vec<TaskRow>, limit: usize) -> (Vec<TaskBrief>, bool) {
    let limit = limit.clamp(1, LIST_MAX);
    let more = rows.len() > limit;
    let tasks = rows
        .iter()
        .take(limit)
        .map(|r| brief(&r.task, r.overdue))
        .collect();
    (tasks, more)
}

/// The words an assistant gets when something is missing or broken (never internal details).
fn say(e: &crate::error::AppError, what: &str) -> String {
    if e.code == ErrorCode::NotFound {
        format!("There is no {what} with that id.")
    } else {
        format!("Pluto could not read that {what}.")
    }
}

pub async fn today(data: &Data) -> Result<Today, String> {
    let rows = tasks::query(
        &data.db,
        &*data.clock,
        TaskView::Today,
        TaskFilters::default(),
    )
    .await
    .map_err(|e| say(&e, "plan"))?;
    // A repeating task already ticked today is done for today.
    let rows: Vec<TaskRow> = rows.into_iter().filter(|r| !r.done_today).collect();
    let (tasks, more) = cap(rows, LIST_MAX);
    Ok(Today {
        date: data.clock.today().to_string(),
        tasks,
        more,
    })
}

pub async fn tasks_list(data: &Data, which: Which, limit: usize) -> Result<TaskList, String> {
    let view = match which {
        Which::Today => TaskView::Today,
        Which::Upcoming => TaskView::Upcoming,
        Which::Pending => TaskView::Pending,
        Which::Completed => TaskView::Completed,
        Which::All => TaskView::All,
    };
    let rows = tasks::query(&data.db, &*data.clock, view, TaskFilters::default())
        .await
        .map_err(|e| say(&e, "list"))?;
    let (tasks, more) = cap(rows, limit);
    Ok(TaskList { tasks, more })
}

pub async fn task_get(data: &Data, id: &str) -> Result<TaskDetail, String> {
    let task = tasks::get(&data.db, id)
        .await
        .map_err(|e| say(&e, "task"))?;
    let overdue = task.due_date.is_some_and(|d| d < data.clock.today())
        && !matches!(upper(task.status).as_str(), "COMPLETED" | "CANCELLED");
    Ok(TaskDetail {
        task: brief(&task, overdue),
        description: task.description.clone(),
        links: task.links.iter().map(|l| l.url.clone()).collect(),
        note_id: task.note_id.clone(),
    })
}

fn note_brief(n: NoteSummary) -> NoteBrief {
    NoteBrief {
        id: n.id,
        title: n.title,
        excerpt: n.excerpt,
        labels: n.labels.into_iter().map(|l| l.name).collect(),
        pinned: n.pinned,
        archived: n.archived,
    }
}

pub async fn notes_search(data: &Data, query: &str) -> Result<NoteHits, String> {
    if query.trim().is_empty() {
        return Err("Give some words to search for.".into());
    }
    let mut hits = notes::search(&data.db, query, false)
        .await
        .map_err(|e| say(&e, "search"))?;
    hits.extend(
        notes::search(&data.db, query, true)
            .await
            .map_err(|e| say(&e, "search"))?,
    );
    hits.truncate(LIST_MAX);
    Ok(NoteHits {
        notes: hits.into_iter().map(note_brief).collect(),
    })
}

pub async fn note_get(data: &Data, id: &str) -> Result<NoteFull, String> {
    let note = notes::get(&data.db, id)
        .await
        .map_err(|e| say(&e, "note"))?;
    // A note in the Bin is gone as far as assistants know.
    if notes::in_bin(&data.db, id).await.unwrap_or(true) {
        return Err("There is no note with that id.".into());
    }
    let cut = note.body.chars().count() > BODY_MAX;
    let body = if cut {
        note.body.chars().take(BODY_MAX).collect()
    } else {
        note.body
    };
    Ok(NoteFull {
        id: note.id,
        title: note.title,
        body,
        cut,
        labels: note.labels.into_iter().map(|l| l.name).collect(),
        project: note.project,
        archived: note.archived,
    })
}
