//! Pluto's MCP server (P4, `desktop-pet-docs/MCP_PLAN.md`): what AI assistants on this PC may ask
//! Pluto to do. This module is the protocol side only: it runs on any byte stream (the shell gives
//! it the private pipe the bridge connects to) and reaches the rest of Pluto through [`Host`], so it
//! has no Tauri and no network code.
//!
//! Step P4.1a: the pet tools `status`, `react` and `say`, the rate limit and the input rules.

pub mod activity;
mod limit;
pub mod link;
pub mod read;
pub mod setup;
pub mod status;
#[cfg(test)]
mod tests;

use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;

use rmcp::handler::server::wrapper::{Json, Parameters};
use rmcp::model::{CallToolResult, ContentBlock, Implementation, ServerCapabilities, ServerConfig};
use rmcp::{schemars, tool, tool_handler, tool_router, ServerHandler};
use serde::{Deserialize, Serialize};

pub use limit::{RateLimit, CALLS_PER_MINUTE};

/// What the assistant reads first: what Pluto is and the rules it keeps.
pub const INSTRUCTIONS: &str =
    "Pluto is the person's desktop pet and productivity app (tasks, notes, \
reminders, meetings, focus sessions, time per app). Everything stays on this computer. Use `react` \
to show a named moment on the pet (for example agent_done when you finish), `say` for a short \
bubble, `status` to see what the person is doing, `today` for today's plan, `tasks_list` and \
`task_get` for tasks, `notes_search` and `note_get` for notes. These tools only read; nothing is \
changed. The diary is private and never available. Calls are limited to 10 per minute per tool.";

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
        host.show(PetMessage {
            assistant: self.assistant.to_string(),
            text,
            reaction: Some(reaction),
        });
        self.noted(
            "react",
            CallToolResult::success(vec![ContentBlock::text(format!(
                "The pet showed {reaction}."
            ))]),
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
        host.show(PetMessage {
            assistant: self.assistant.to_string(),
            text,
            reaction: None,
        });
        self.noted(
            "say",
            CallToolResult::success(vec![ContentBlock::text("The pet said it.")]),
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
}

#[tool_handler]
impl ServerHandler for PlutoMcp {
    fn get_info(&self) -> ServerConfig {
        let mut me = Implementation::new("pluto", env!("CARGO_PKG_VERSION"));
        me.title = Some("Pluto".into());
        ServerConfig::new(ServerCapabilities::builder().enable_tools().build())
            .with_server_info(me)
            .with_instructions(INSTRUCTIONS)
    }
}
