//! Pluto's MCP server (P4, `desktop-pet-docs/MCP_PLAN.md`): what AI assistants on this PC may ask
//! Pluto to do. This module is the protocol side only: it runs on any byte stream (the shell gives
//! it the private pipe the bridge connects to) and reaches the rest of Pluto through [`Host`], so it
//! has no Tauri and no network code.
//!
//! Step P4.1a: the pet tools `status`, `react` and `say`, the rate limit and the input rules.

pub mod activity;
pub mod ask;
mod limit;
pub mod link;
pub mod read;
pub mod setup;
pub mod status;
#[cfg(test)]
mod tests;
pub mod write;

use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;

use rmcp::handler::server::wrapper::{Json, Parameters};
use rmcp::model::{
    CallToolResult, ContentBlock, Implementation, ListResourceTemplatesResult, ListResourcesResult,
    PaginatedRequestParams, ReadResourceRequestParams, ReadResourceResponse, ReadResourceResult,
    Resource, ResourceContents, ResourceTemplate, ServerCapabilities, ServerConfig,
};
use rmcp::model::{PromptMessage, Role};
use rmcp::service::RequestContext;
use rmcp::{
    prompt, prompt_handler, prompt_router, schemars, tool, tool_handler, tool_router, ServerHandler,
};
use rmcp::{ErrorData, RoleServer};
use serde::{Deserialize, Serialize};

pub use limit::{RateLimit, CALLS_PER_MINUTE};

/// What the assistant reads first: what Pluto is and the rules it keeps.
pub const INSTRUCTIONS: &str =
    "Pluto is the person's desktop pet and productivity app (tasks, notes, \
reminders, meetings, focus sessions, time per app). Everything stays on this computer. Use `react` \
to show a named moment on the pet (for example agent_done when you finish), `say` for a short \
bubble, `status` to see what the person is doing, `today` for today's plan, `tasks_list` and \
`task_get` for tasks, `notes_search` and `note_get` for notes. To change things use `task_add`, \
`task_update`, `task_complete`, `reminder_add`, `note_add` and `note_append`; only do so when the \
person asked, and tell them what you changed. Every change shows in Pluto with an Undo. Reminders \
and meetings go to the Bin when deleted (`reminder_delete`, `meeting_delete`); nothing is deleted \
for good. `setting_change` asks the person to Allow on the pet first; `ask_person` asks them a short \
question with buttons on the pet. The diary is private and never available. Calls are limited to 10 per minute per tool.";

/// What every tool answers while Pluto itself is not running.
pub const NOT_RUNNING: &str = "Pluto is not running. Open Pluto and try again.";

/// Longest bubble an assistant may show, in characters.
pub const SAY_MAX_CHARS: usize = 140;

/// A future the [`Host`] returns (boxed so the host can be a trait object).
pub type HostFuture<'a, T> = Pin<Box<dyn Future<Output = T> + Send + 'a>>;

/// The rest of Pluto, as the MCP server sees it. The shell implements it with the real services
/// and the pet window; tests use a fake.
pub trait Host: Send + Sync {
    /// What Pluto is doing right now.
    fn status(&self) -> HostFuture<'_, Status>;
    /// Show something on the pet.
    fn show(&self, message: PetMessage);
    /// Pluto's tasks and notes for the read tools; `None` while the data is not open yet.
    fn data(&self) -> Option<read::Data> {
        None
    }
    /// Note a change for the Assistants page, with its way back.
    fn changed(&self, _tool: &'static str, _assistant: &str, _change: write::Change) {}
    /// Ask the person on the pet; `None` when they did not answer in time or cannot be asked.
    fn ask(&self, _question: ask::Question) -> HostFuture<'_, Option<String>> {
        Box::pin(async { None })
    }
    /// Keep a pet message back for now (focus guard); true when it was kept.
    fn hold(&self, _message: &PetMessage) -> bool {
        false
    }
    /// Note a call for the Assistants page (the host adds the time).
    fn record(&self, _tool: &'static str, _assistant: &str, _ok: bool, _detail: String) {}
}

/// The answer to `status`: no titles, no note text.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, schemars::JsonSchema)]
pub struct Status {
    /// The focus session running now, if any.
    pub focus: Option<FocusNow>,
    /// The app in front (program name, never a window title), if tracking is on.
    pub app_in_front: Option<String>,
    /// Today's tasks.
    pub today: TodayCounts,
}

/// A running focus session.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, schemars::JsonSchema)]
pub struct FocusNow {
    /// "focus" or "break".
    pub kind: String,
    /// Whole minutes left.
    pub minutes_left: u32,
    pub paused: bool,
}

/// Counts of today's tasks.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, schemars::JsonSchema)]
pub struct TodayCounts {
    pub done: u32,
    pub open: u32,
    pub overdue: u32,
}

/// Something an assistant asked the pet to show.
#[derive(Debug, Clone, PartialEq)]
pub struct PetMessage {
    /// The assistant's name as the person set it in Pluto (never text the assistant sent).
    pub assistant: String,
    /// The line to show.
    pub text: String,
    /// The reaction's name, or `None` for a `say` bubble.
    pub reaction: Option<&'static str>,
}

/// The named moments an assistant (or a hook, a git watcher, a build) may raise. Each has a
/// default line; `{}` is the assistant's name.
pub const REACTIONS: &[(&str, &str)] = &[
    ("agent_done", "{} is done"),
    ("agent_needs_you", "{} needs you"),
    ("agent_error", "{} hit an error"),
    ("git_commit", "Committed"),
    ("git_push", "Pushed"),
    ("build_ok", "Build passed"),
    ("build_failed", "Build failed"),
];

/// The line for a reaction, or `None` if there is no such reaction.
pub fn reaction_line(name: &str, assistant: &str) -> Option<(&'static str, String)> {
    REACTIONS
        .iter()
        .find(|(n, _)| *n == name)
        .map(|(n, line)| (*n, line.replace("{}", assistant)))
}

/// A bubble's text made safe to show: control characters become spaces, runs of spaces become
/// one, the ends are trimmed. Refused when empty or longer than [`SAY_MAX_CHARS`].
pub fn clean_bubble(text: &str) -> Result<String, String> {
    let spaced: String = text
        .chars()
        .map(|c| if c.is_control() { ' ' } else { c })
        .collect();
    let clean = spaced.split_whitespace().collect::<Vec<_>>().join(" ");
    let chars = clean.chars().count();
    if chars == 0 {
        return Err("The bubble has no text.".into());
    }
    if chars > SAY_MAX_CHARS {
        return Err(format!(
            "The bubble is {chars} characters; the pet shows at most {SAY_MAX_CHARS}."
        ));
    }
    Ok(clean)
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct ReactArgs {
    /// One of: agent_done, agent_needs_you, agent_error, git_commit, git_push, build_ok, build_failed.
    pub reaction: String,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct TasksArgs {
    /// today (default), upcoming (next 7 days), pending (no day yet), completed, or all.
    #[serde(default)]
    pub which: read::Which,
    /// At most this many (1 to 50, default 20).
    pub limit: Option<u32>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct IdArgs {
    /// The id from a list or search.
    pub id: String,
}

#[derive(Debug, Default, Deserialize, schemars::JsonSchema)]
pub struct RemindersArgs {
    /// Also list reminders already done.
    #[serde(default)]
    pub include_done: bool,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct SearchArgs {
    /// Words to look for in note titles and text.
    pub query: String,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct SayArgs {
    /// Plain text, at most 140 characters.
    pub text: String,
}

/// One assistant's connection to Pluto.
#[derive(Clone)]
pub struct PlutoMcp {
    /// `None` while the bridge cannot reach a running Pluto.
    host: Option<Arc<dyn Host>>,
    assistant: Arc<str>,
    limit: Arc<RateLimit>,
}

impl PlutoMcp {
    /// `assistant` is the name the person gave this assistant in Pluto; `limit` is shared by all
    /// of that assistant's connections.
    pub fn new(host: Arc<dyn Host>, assistant: &str, limit: Arc<RateLimit>) -> Self {
        Self {
            host: Some(host),
            assistant: assistant.into(),
            limit,
        }
    }

    /// What the bridge serves while Pluto is not running: the same tools (so the assistant knows
    /// them), each answering [`NOT_RUNNING`].
    pub fn offline(assistant: &str) -> Self {
        Self {
            host: None,
            assistant: assistant.into(),
            limit: Arc::new(RateLimit::default()),
        }
    }

    /// Serves one connection until the other side closes it.
    pub async fn serve<T>(self, io: T) -> Result<(), String>
    where
        T: tokio::io::AsyncRead + tokio::io::AsyncWrite + Send + Unpin + 'static,
    {
        let running = rmcp::ServiceExt::serve(self, io)
            .await
            .map_err(|e| e.to_string())?;
        running.waiting().await.map_err(|e| e.to_string())?;
        Ok(())
    }

    /// The running Pluto, or the refusal to send when there is none.
    fn host(&self) -> Result<&Arc<dyn Host>, CallToolResult> {
        self.host.as_ref().ok_or_else(|| Self::refused(NOT_RUNNING))
    }

    /// Pluto's data for a read tool, or the refusal to send.
    fn data(&self) -> Result<read::Data, CallToolResult> {
        self.host()?
            .data()
            .ok_or_else(|| Self::refused("Pluto is still starting. Try again in a moment."))
    }

    /// Runs one read tool: limit, data, the read itself, noted for the Assistants page.
    async fn reading<T, F, Fut>(
        &self,
        tool: &'static str,
        what: &str,
        read: F,
    ) -> Result<Json<T>, CallToolResult>
    where
        F: FnOnce(read::Data) -> Fut,
        Fut: Future<Output = Result<T, String>>,
    {
        if let Some(refused) = self.over_limit(tool) {
            return Err(self.noted(tool, refused));
        }
        let data = self.data()?;
        match read(data).await {
            Ok(answer) => {
                self.noted(
                    tool,
                    CallToolResult::success(vec![ContentBlock::text(format!("Read {what}."))]),
                );
                Ok(Json(answer))
            }
            Err(why) => Err(self.noted(tool, Self::refused(why))),
        }
    }

    /// Runs one change tool: limit, data, the change, noted with its Undo.
    async fn writing<F, Fut>(
        &self,
        tool: &'static str,
        change: F,
    ) -> Result<Json<write::Done>, CallToolResult>
    where
        F: FnOnce(read::Data) -> Fut,
        Fut: Future<Output = Result<(write::Done, write::Change), String>>,
    {
        if let Some(refused) = self.over_limit(tool) {
            return Err(self.noted(tool, refused));
        }
        let data = self.data()?;
        match change(data).await {
            Ok((done, change)) => {
                if let Some(host) = &self.host {
                    host.changed(tool, &self.assistant, change);
                }
                Ok(Json(done))
            }
            Err(why) => Err(self.noted(tool, Self::refused(why))),
        }
    }

    /// Shows a message on the pet, unless the focus guard keeps it until the session ends.
    fn show_or_hold(host: &Arc<dyn Host>, message: PetMessage) -> bool {
        if host.hold(&message) {
            return false;
        }
        host.show(message);
        true
    }

    /// One reaction from a hook, git or a build (no MCP session): the same limit, focus guard and
    /// log as the `react` tool. Returns what happened, in words.
    pub fn react_once(&self, reaction: &'static str) -> String {
        let result = match (self.over_limit("react"), &self.host) {
            (Some(refused), _) => refused,
            (None, None) => Self::refused(NOT_RUNNING),
            (None, Some(host)) => {
                let text = reaction_line(reaction, &self.assistant)
                    .map(|(_, t)| t)
                    .unwrap_or_default();
                let shown = Self::show_or_hold(
                    host,
                    PetMessage {
                        assistant: self.assistant.to_string(),
                        text,
                        reaction: Some(reaction),
                    },
                );
                CallToolResult::success(vec![ContentBlock::text(if shown {
                    format!("The pet showed {reaction}.")
                } else {
                    format!("Held {reaction} until the focus session ends.")
                })])
            }
        };
        let result = self.noted("react", result);
        result
            .content
            .first()
            .and_then(|c| c.as_text())
            .map(|t| t.text.clone())
            .unwrap_or_default()
    }

    fn refused(message: impl Into<String>) -> CallToolResult {
        CallToolResult::error(vec![ContentBlock::text(message.into())])
    }

    /// Notes the call on the running Pluto (nothing to note while offline) and returns it.
    fn noted(&self, tool: &'static str, result: CallToolResult) -> CallToolResult {
        if let Some(host) = &self.host {
            let detail = result
                .content
                .first()
                .and_then(|c| c.as_text())
                .map(|t| t.text.clone())
                .unwrap_or_default();
            host.record(tool, &self.assistant, result.is_error != Some(true), detail);
        }
        result
    }

    fn over_limit(&self, tool: &'static str) -> Option<CallToolResult> {
        (!self.limit.allow(tool)).then(|| {
            Self::refused(format!(
                "Too many `{tool}` calls: Pluto allows {CALLS_PER_MINUTE} a minute. Try again in a minute."
            ))
        })
    }
}

#[tool_router]
impl PlutoMcp {
    #[tool(
        title = "What Pluto is doing",
        description = "What the person is doing now in Pluto: the focus session (kind, minutes left, paused), the app in front (program name only) and today's task counts. No titles or note text.",
        annotations(read_only_hint = true, idempotent_hint = true, open_world_hint = false)
    )]
    async fn status(&self) -> Result<Json<Status>, CallToolResult> {
        if let Some(refused) = self.over_limit("status") {
            return Err(self.noted("status", refused));
        }
        let status = self.host()?.status().await;
        self.noted(
            "status",
            CallToolResult::success(vec![ContentBlock::text("Read what Pluto is doing.")]),
        );
        Ok(Json(status))
    }

    #[tool(
        title = "Make the pet react",
        description = "Play a named moment on the desktop pet, shown over whatever app the person is in. Use agent_done when you finish a task, agent_needs_you when you are waiting for the person, agent_error when you are stuck.",
        annotations(
            read_only_hint = false,
            destructive_hint = false,
            idempotent_hint = false,
            open_world_hint = false
        )
    )]
    async fn react(&self, Parameters(args): Parameters<ReactArgs>) -> CallToolResult {
        if let Some(refused) = self.over_limit("react") {
            return self.noted("react", refused);
        }
        let host = match self.host() {
            Ok(host) => host,
            Err(refused) => return refused,
        };
        let Some((reaction, text)) = reaction_line(args.reaction.trim(), &self.assistant) else {
            let names: Vec<&str> = REACTIONS.iter().map(|(n, _)| *n).collect();
            return self.noted(
                "react",
                Self::refused(format!(
                    "There is no reaction `{}`. Use one of: {}.",
                    args.reaction,
                    names.join(", ")
                )),
            );
        };
        let shown = Self::show_or_hold(
            host,
            PetMessage {
                assistant: self.assistant.to_string(),
                text,
                reaction: Some(reaction),
            },
        );
        let said = if shown {
            format!("The pet showed {reaction}.")
        } else {
            format!("The person is in a focus session; {reaction} will show when it ends.")
        };
        self.noted(
            "react",
            CallToolResult::success(vec![ContentBlock::text(said)]),
        )
    }

    #[tool(
        title = "Say something on the pet",
        description = "Show a short speech bubble (plain text, at most 140 characters) on the desktop pet, labelled with your name. During a focus session it may show as a silent badge instead.",
        annotations(
            read_only_hint = false,
            destructive_hint = false,
            idempotent_hint = false,
            open_world_hint = false
        )
    )]
    async fn say(&self, Parameters(args): Parameters<SayArgs>) -> CallToolResult {
        if let Some(refused) = self.over_limit("say") {
            return self.noted("say", refused);
        }
        let host = match self.host() {
            Ok(host) => host,
            Err(refused) => return refused,
        };
        let text = match clean_bubble(&args.text) {
            Ok(text) => text,
            Err(why) => return self.noted("say", Self::refused(why)),
        };
        let shown = Self::show_or_hold(
            host,
            PetMessage {
                assistant: self.assistant.to_string(),
                text,
                reaction: None,
            },
        );
        let said = if shown {
            "The pet said it."
        } else {
            "The person is in a focus session; the pet will say it when it ends."
        };
        self.noted(
            "say",
            CallToolResult::success(vec![ContentBlock::text(said)]),
        )
    }

    #[tool(
        title = "Today's plan",
        description = "Today's date and the person's open tasks for today, including overdue ones and ones in progress, in the order Pluto shows them. Read only.",
        annotations(read_only_hint = true, idempotent_hint = true, open_world_hint = false)
    )]
    async fn today(&self) -> Result<Json<read::Today>, CallToolResult> {
        self.reading(
            "today",
            "today's plan",
            |d| async move { read::today(&d).await },
        )
        .await
    }

    #[tool(
        title = "List tasks",
        description = "The person's tasks: today, upcoming (next 7 days), pending (no day yet), completed, or all. Titles, status, priority, project and days; use task_get for the description. Read only.",
        annotations(read_only_hint = true, idempotent_hint = true, open_world_hint = false)
    )]
    async fn tasks_list(
        &self,
        Parameters(args): Parameters<TasksArgs>,
    ) -> Result<Json<read::TaskList>, CallToolResult> {
        let limit = args.limit.map_or(20, |n| n as usize);
        self.reading("tasks_list", "a list of tasks", |d| async move {
            read::tasks_list(&d, args.which, limit).await
        })
        .await
    }

    #[tool(
        title = "Read a task",
        description = "One task with its description, links and the note it belongs to. Read only.",
        annotations(read_only_hint = true, idempotent_hint = true, open_world_hint = false)
    )]
    async fn task_get(
        &self,
        Parameters(args): Parameters<IdArgs>,
    ) -> Result<Json<read::TaskDetail>, CallToolResult> {
        self.reading("task_get", "a task", |d| async move {
            read::task_get(&d, args.id.trim()).await
        })
        .await
    }

    #[tool(
        title = "Search notes",
        description = "Find the person's notes (and archived notes) whose title or text contains the words. Returns titles and the start of each note; use note_get for the whole note. Never searches the diary. Read only.",
        annotations(read_only_hint = true, idempotent_hint = true, open_world_hint = false)
    )]
    async fn notes_search(
        &self,
        Parameters(args): Parameters<SearchArgs>,
    ) -> Result<Json<read::NoteHits>, CallToolResult> {
        self.reading("notes_search", "a note search", |d| async move {
            read::notes_search(&d, &args.query).await
        })
        .await
    }

    #[tool(
        title = "Read a note",
        description = "One whole note: title, text, labels and project. Notes in the Bin are not available. Read only.",
        annotations(read_only_hint = true, idempotent_hint = true, open_world_hint = false)
    )]
    async fn note_get(
        &self,
        Parameters(args): Parameters<IdArgs>,
    ) -> Result<Json<read::NoteFull>, CallToolResult> {
        self.reading("note_get", "a note", |d| async move {
            read::note_get(&d, args.id.trim()).await
        })
        .await
    }

    #[tool(
        title = "Add a task",
        description = "Add a task to the person's list. Only when they asked for it. Optional: description, priority (HIGH, MEDIUM, LOW), planned day and due day (YYYY-MM-DD), project. Shown in Pluto with an Undo.",
        annotations(
            read_only_hint = false,
            destructive_hint = false,
            idempotent_hint = false,
            open_world_hint = false
        )
    )]
    async fn task_add(
        &self,
        Parameters(a): Parameters<write::TaskAddArgs>,
    ) -> Result<Json<write::Done>, CallToolResult> {
        self.writing("task_add", |d| async move { write::task_add(&d, a).await })
            .await
    }

    #[tool(
        title = "Change a task",
        description = "Change a task's title, description, priority, planned day or due day. Give only what changes; \"\" clears a day or the priority. Shown in Pluto with an Undo.",
        annotations(
            read_only_hint = false,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = false
        )
    )]
    async fn task_update(
        &self,
        Parameters(a): Parameters<write::TaskUpdateArgs>,
    ) -> Result<Json<write::Done>, CallToolResult> {
        self.writing(
            "task_update",
            |d| async move { write::task_update(&d, a).await },
        )
        .await
    }

    #[tool(
        title = "Mark a task done",
        description = "Mark one of the person's tasks done, when they say they finished it. Shown in Pluto with an Undo.",
        annotations(
            read_only_hint = false,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = false
        )
    )]
    async fn task_complete(
        &self,
        Parameters(a): Parameters<IdArgs>,
    ) -> Result<Json<write::Done>, CallToolResult> {
        self.writing("task_complete", |d| async move {
            write::task_complete(&d, &a.id).await
        })
        .await
    }

    #[tool(
        title = "List reminders",
        description = "The person's reminders still to come, soonest first, with their local time. Read only.",
        annotations(read_only_hint = true, idempotent_hint = true, open_world_hint = false)
    )]
    async fn reminders_list(
        &self,
        Parameters(a): Parameters<RemindersArgs>,
    ) -> Result<Json<read::ReminderList>, CallToolResult> {
        self.reading("reminders_list", "the reminders", |d| async move {
            read::reminders_list(&d, a.include_done).await
        })
        .await
    }

    #[tool(
        title = "List meetings",
        description = "The person's latest meetings, newest first: title, time, participants and open action items. Read only.",
        annotations(read_only_hint = true, idempotent_hint = true, open_world_hint = false)
    )]
    async fn meetings_list(&self) -> Result<Json<read::MeetingList>, CallToolResult> {
        self.reading("meetings_list", "the meetings", |d| async move {
            read::meetings_list(&d).await
        })
        .await
    }

    #[tool(
        title = "Delete a reminder (to the Bin)",
        description = "Move one of the person's reminders to Pluto's Bin, when they ask. It can be restored for 30 days, and the change shows with an Undo.",
        annotations(
            read_only_hint = false,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = false
        )
    )]
    async fn reminder_delete(
        &self,
        Parameters(a): Parameters<IdArgs>,
    ) -> Result<Json<write::Done>, CallToolResult> {
        self.writing("reminder_delete", |d| async move {
            write::reminder_delete(&d, &a.id).await
        })
        .await
    }

    #[tool(
        title = "Delete a meeting (to the Bin)",
        description = "Move one of the person's meetings to Pluto's Bin, when they ask. Tasks made from it stay. It can be restored for 30 days, and the change shows with an Undo.",
        annotations(
            read_only_hint = false,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = false
        )
    )]
    async fn meeting_delete(
        &self,
        Parameters(a): Parameters<IdArgs>,
    ) -> Result<Json<write::Done>, CallToolResult> {
        self.writing("meeting_delete", |d| async move {
            write::meeting_delete(&d, &a.id).await
        })
        .await
    }

    #[tool(
        title = "Add a reminder",
        description = "Add a reminder that pops up on the pet at a time in the person's local time (\"YYYY-MM-DD HH:MM\"). Shown in Pluto with an Undo.",
        annotations(
            read_only_hint = false,
            destructive_hint = false,
            idempotent_hint = false,
            open_world_hint = false
        )
    )]
    async fn reminder_add(
        &self,
        Parameters(a): Parameters<write::ReminderAddArgs>,
    ) -> Result<Json<write::Done>, CallToolResult> {
        self.writing("reminder_add", |d| async move {
            write::reminder_add(&d, a).await
        })
        .await
    }

    #[tool(
        title = "Make a note",
        description = "Make a new note with a title and text, only when the person asked (for example a review they want kept). Shown in Pluto with an Undo.",
        annotations(
            read_only_hint = false,
            destructive_hint = false,
            idempotent_hint = false,
            open_world_hint = false
        )
    )]
    async fn note_add(
        &self,
        Parameters(a): Parameters<write::NoteAddArgs>,
    ) -> Result<Json<write::Done>, CallToolResult> {
        self.writing("note_add", |d| async move { write::note_add(&d, a).await })
            .await
    }

    #[tool(
        title = "Add to a note",
        description = "Add text at the end of one of the person's notes. Nothing already there is changed. Shown in Pluto with an Undo.",
        annotations(
            read_only_hint = false,
            destructive_hint = false,
            idempotent_hint = false,
            open_world_hint = false
        )
    )]
    async fn note_append(
        &self,
        Parameters(a): Parameters<write::NoteAppendArgs>,
    ) -> Result<Json<write::Done>, CallToolResult> {
        self.writing(
            "note_append",
            |d| async move { write::note_append(&d, a).await },
        )
        .await
    }

    #[tool(
        title = "Ask the person on the pet",
        description = "Show a short question (at most 140 characters) on the desktop pet with two to four answer buttons, and wait up to two minutes for the press. Use it when you need a quick choice while the person may be in another app. Returns the answer, or null if they did not answer.",
        annotations(read_only_hint = true, open_world_hint = false)
    )]
    async fn ask_person(
        &self,
        Parameters(a): Parameters<ask::AskArgs>,
    ) -> Result<Json<ask::Answer>, CallToolResult> {
        if let Some(refused) = self.over_limit("ask_person") {
            return Err(self.noted("ask_person", refused));
        }
        let host = self.host()?.clone();
        match ask::ask(&*host, &self.assistant, a).await {
            Ok(answer) => {
                let said = match &answer.answer {
                    Some(a) => format!("The person answered: {a}."),
                    None => "The person did not answer.".to_owned(),
                };
                self.noted(
                    "ask_person",
                    CallToolResult::success(vec![ContentBlock::text(said)]),
                );
                Ok(Json(answer))
            }
            Err(why) => Err(self.noted("ask_person", Self::refused(why))),
        }
    }

    #[tool(
        title = "Change a setting (with the person's Allow)",
        description = "Change one of Pluto's settings. The pet shows the change with Allow and Deny; nothing changes unless the person presses Allow within two minutes. Allowed keys: general.theme (system, light, dark), pet.size (S, M, L), pet.hover_card, pet.typing, pet.hide_fullscreen, pet.always_on_top, mcp.focus_guard (true or false). Shown in Pluto with an Undo.",
        annotations(
            read_only_hint = false,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = false
        )
    )]
    async fn setting_change(
        &self,
        Parameters(a): Parameters<ask::SettingArgs>,
    ) -> Result<Json<write::Done>, CallToolResult> {
        let host = self.host()?.clone();
        let assistant = self.assistant.to_string();
        self.writing("setting_change", |d| async move {
            ask::setting_change(&*host, &d, &assistant, a).await
        })
        .await
    }
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct MeetingArgs {
    /// The meeting notes or transcript.
    pub notes: String,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct TopicArgs {
    /// What to be quizzed on (a course or a note's subject).
    pub topic: String,
}

fn ask(text: impl Into<String>) -> Vec<PromptMessage> {
    vec![PromptMessage::new_text(Role::User, text.into())]
}

/// Ready-made requests the person can pick in their assistant (owner's additions, 2026-11-02).
#[prompt_router]
impl PlutoMcp {
    #[prompt(
        name = "plan_my_day",
        description = "Look at today in Pluto and suggest an order for the day."
    )]
    async fn plan_my_day(&self) -> Vec<PromptMessage> {
        ask("Use Pluto's `today` and `status` tools. Suggest an order for my open tasks today, overdue ones first, in a short list. Don't change anything unless I ask.")
    }

    #[prompt(
        name = "daily_review",
        description = "A short review of today from Pluto, in the chat."
    )]
    async fn daily_review(&self) -> Vec<PromptMessage> {
        ask("Use Pluto's `tasks_list` (completed and today) and `status`. Give me a short review of today: what got done, what is still open, one suggestion for tomorrow. Answer here; only save it as a note in Pluto if I ask.")
    }

    #[prompt(
        name = "weekly_review",
        description = "A short review of the week from Pluto, in the chat."
    )]
    async fn weekly_review(&self) -> Vec<PromptMessage> {
        ask("Use Pluto's `tasks_list` with completed, upcoming and pending. Give me a short review of this week: what got done, what slipped, and what to focus on next week. Answer here; only save it as a note in Pluto if I ask.")
    }

    #[prompt(
        name = "meeting_to_tasks",
        description = "Turn meeting notes into tasks in Pluto."
    )]
    async fn meeting_to_tasks(&self, Parameters(a): Parameters<MeetingArgs>) -> Vec<PromptMessage> {
        ask(format!("Here are my meeting notes:\n\n{}\n\nList the action items for me. After I confirm, add each one to Pluto with `task_add` (with a due day if one was said) and tell me what you added.", a.notes))
    }

    #[prompt(
        name = "what_was_i_doing",
        description = "After a break: what you were working on in Pluto."
    )]
    async fn what_was_i_doing(&self) -> Vec<PromptMessage> {
        ask("Use Pluto's `status` and `today`. In two lines, remind me what I was working on and what is next.")
    }

    #[prompt(name = "study_quiz", description = "Quiz me from my notes in Pluto.")]
    async fn study_quiz(&self, Parameters(a): Parameters<TopicArgs>) -> Vec<PromptMessage> {
        ask(format!("Use Pluto's `notes_search` for \"{}\" and `note_get` to read the notes. Ask me five short questions from them, one at a time, and tell me if I got each right.", a.topic))
    }
}

#[tool_handler]
#[prompt_handler(router = Self::prompt_router())]
impl ServerHandler for PlutoMcp {
    fn get_info(&self) -> ServerConfig {
        let mut me = Implementation::new("pluto", env!("CARGO_PKG_VERSION"));
        me.title = Some("Pluto".into());
        ServerConfig::new(
            ServerCapabilities::builder()
                .enable_tools()
                .enable_prompts()
                .enable_resources()
                .build(),
        )
        .with_server_info(me)
        .with_instructions(INSTRUCTIONS)
    }

    async fn list_resources(
        &self,
        _request: Option<PaginatedRequestParams>,
        _context: RequestContext<RoleServer>,
    ) -> Result<ListResourcesResult, ErrorData> {
        let one = |uri: &str, name: &str, about: &str| {
            Resource::new(uri, name)
                .with_description(about)
                .with_mime_type("application/json")
        };
        Ok(ListResourcesResult::with_all_items(vec![
            one(
                "pluto://today",
                "Today's plan",
                "Today's date and open tasks, as the today tool gives them.",
            ),
            one(
                "pluto://status",
                "What Pluto is doing",
                "The focus session and today's task counts.",
            ),
        ]))
    }

    async fn list_resource_templates(
        &self,
        _request: Option<PaginatedRequestParams>,
        _context: RequestContext<RoleServer>,
    ) -> Result<ListResourceTemplatesResult, ErrorData> {
        Ok(ListResourceTemplatesResult::with_all_items(vec![
            ResourceTemplate::new("pluto://note/{id}", "A note")
                .with_description("One whole note by its id (never the diary or the Bin).")
                .with_mime_type("application/json"),
            ResourceTemplate::new("pluto://task/{id}", "A task")
                .with_description("One task with its description and links.")
                .with_mime_type("application/json"),
        ]))
    }

    async fn read_resource(
        &self,
        request: ReadResourceRequestParams,
        _context: RequestContext<RoleServer>,
    ) -> Result<ReadResourceResponse, ErrorData> {
        let uri = request.uri;
        let refused = |why: String| ErrorData::resource_not_found(why, None);
        if self.over_limit("resources").is_some() {
            return Err(ErrorData::invalid_request(
                format!("Pluto allows {CALLS_PER_MINUTE} reads a minute. Try again in a minute."),
                None,
            ));
        }
        let host = self
            .host
            .as_ref()
            .ok_or_else(|| refused(NOT_RUNNING.into()))?;
        let data = host
            .data()
            .ok_or_else(|| refused("Pluto is still starting. Try again in a moment.".into()))?;
        let json = match uri.as_str() {
            "pluto://today" => serde_json::to_string(&read::today(&data).await.map_err(refused)?),
            "pluto://status" => serde_json::to_string(&host.status().await),
            _ => {
                if let Some(id) = uri.strip_prefix("pluto://note/") {
                    serde_json::to_string(&read::note_get(&data, id).await.map_err(refused)?)
                } else if let Some(id) = uri.strip_prefix("pluto://task/") {
                    serde_json::to_string(&read::task_get(&data, id).await.map_err(refused)?)
                } else {
                    return Err(refused(format!("Pluto has no resource {uri}.")));
                }
            }
        }
        .map_err(|e| ErrorData::internal_error(e.to_string(), None))?;
        host.record("resources", &self.assistant, true, format!("Read {uri}."));
        let mut contents = ResourceContents::text(json, uri);
        if let ResourceContents::TextResourceContents { mime_type, .. } = &mut contents {
            *mime_type = Some("application/json".into());
        }
        Ok(ReadResourceResult::new(vec![contents]).into())
    }
}
