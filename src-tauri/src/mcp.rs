//! MCP in the shell (`MCP_PLAN.md` §3): the private pipe the running Pluto listens on, the
//! per-run token file, the [`Host`] that makes the real pet speak, and `--mcp-bridge`, which an
//! assistant starts and which runs before any window, tray or single-instance rule.
//!
//! Step P4.1a. Listening only while `mcp.enabled` is on (off by default), following the switch on
//! the Assistants page live; the page reads the setup to copy and the recent calls from here.

use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, PoisonError};

use pluto_core::bus::{EventBus, Recv};
use pluto_core::clock::Clock;
use pluto_core::events::Event;
use std::sync::atomic::{AtomicBool, Ordering};

use pluto_core::mcp::activity::{Activity, Call};
use pluto_core::mcp::ask::{Question, ANSWER_WAIT};
use pluto_core::mcp::setup::{self, Format};
use pluto_core::mcp::write::{self, Change};
use pluto_core::mcp::{away, hookctx, link, waiting, working};
use pluto_core::mcp::{Host, HostFuture, PetMessage, RateLimit, Status, WaitChange, WorkChange};
use pluto_core::settings_service::SettingsService;
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, Runtime, State};

/// The flag an assistant's config uses: `Pluto --mcp-bridge --assistant <id>`.
pub const BRIDGE_FLAG: &str = "--mcp-bridge";
const TOKEN_FILE: &str = "mcp-token";
#[cfg(unix)]
const SOCKET_FILE: &str = "mcp.sock";

/// Where this user's pipe is (Windows) or would be (the Unix socket in the data folder).
#[cfg(windows)]
fn pipe_name() -> String {
    let user: String = std::env::var("USERNAME")
        .unwrap_or_default()
        .chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .collect();
    format!(r"\\.\pipe\pluto-mcp-{user}")
}

/// Pluto's data folder as the app computes it, without starting Tauri (the bridge must stay
/// small and fast): `PLUTO_DATA_DIR`, else the OS's application-data folder.
fn data_dir() -> Option<PathBuf> {
    if let Some(dir) = std::env::var_os("PLUTO_DATA_DIR").filter(|d| !d.is_empty()) {
        return Some(PathBuf::from(dir));
    }
    let base = if cfg!(windows) {
        PathBuf::from(std::env::var_os("APPDATA")?)
    } else if cfg!(target_os = "macos") {
        PathBuf::from(std::env::var_os("HOME")?).join("Library/Application Support")
    } else {
        std::env::var_os("XDG_DATA_HOME")
            .map(PathBuf::from)
            .or_else(|| std::env::var_os("HOME").map(|h| PathBuf::from(h).join(".local/share")))?
    };
    Some(base.join("app.pluto.desktop"))
}

/// The assistant id from `--assistant <id>`; "assistant" when missing or not a valid id.
pub fn assistant_from(args: &[String]) -> String {
    args.iter()
        .position(|a| a == "--assistant")
        .and_then(|i| args.get(i + 1))
        .filter(|id| link::id_is_valid(id))
        .cloned()
        .unwrap_or_else(|| "assistant".into())
}

/// `Pluto --react <reaction>`: play one reaction and exit (Claude Code hooks, git hooks).
pub const REACT_FLAG: &str = "--react";
// Builds use `<build> && Pluto --react build_ok || Pluto --react build_failed`: Pluto is a
// windowed program (owner: no console), so it cannot run a build and show its output itself.

fn token_now() -> String {
    data_dir()
        .and_then(|d| std::fs::read_to_string(d.join(TOKEN_FILE)).ok())
        .map(|t| t.trim().to_owned())
        .unwrap_or_default()
}

/// Sends one reaction to the running Pluto. Never fails the caller: a hook or a build must not
/// break because Pluto is closed or assistants are off.
async fn react_now(assistant: &str, reaction: &str, extra: Option<String>) {
    let token = token_now();
    if token.is_empty() {
        return;
    }
    // A Claude Code hook pipes its chat's details in: say which chat (folder, first request)
    // and whether it is asking for permission (owner 2026-11-03).
    // Codex hands its turn's details over as a last argument and OpenCode's plugin sets
    // PLUTO_CWD; Claude Code and Cursor pipe JSON in (H-1..H-3).
    let (reaction, place) = match extra.or_else(hook_input) {
        Some(input) => from_hook(reaction, &input),
        None => (reaction, None),
    };
    // The chat's terminal or editor window, so a click on its bubble can bring it forward (A-4).
    // Only a chat that waits for you needs one.
    let window = matches!(reaction, "agent_needs_you" | "agent_permission")
        .then(crate::jump::my_window)
        .flatten();
    if let Some(pipe) = connect().await {
        let _ = link::send_reaction_at(pipe, &token, assistant, reaction, place.as_deref(), window)
            .await;
    }
}

/// The reaction and the chat it is about, from a Claude Code hook's input: a "needs you" that asks
/// for a permission becomes `agent_permission`; the place is the folder and the first request.
fn from_hook<'a>(reaction: &'a str, input: &str) -> (&'a str, Option<String>) {
    let ctx = hookctx::parse(input);
    // Codex says the request itself; Claude Code only names a transcript to read it from.
    let request = ctx.request.clone().or_else(|| {
        ctx.transcript
            .as_deref()
            .and_then(transcript_head)
            .and_then(|t| hookctx::first_request(&t))
    });
    let reaction = if ctx.permission && reaction == "agent_needs_you" {
        "agent_permission"
    } else if reaction == "agent_done" && ends_with_question(&ctx) {
        // A tool with no "waiting for you" hook still tells us when it ends by asking something
        // (owner 2026-11-03: needs-you for every assistant).
        "agent_needs_you"
    } else {
        reaction
    };
    let place = if reaction == "agent_permission" {
        hookctx::permission_place(&ctx, request.as_deref())
    } else {
        hookctx::place(&ctx, request.as_deref())
    };
    (reaction, place)
}

/// Whether the assistant's last message, from the hook or the end of its transcript, asks you something.
fn ends_with_question(ctx: &hookctx::HookInput) -> bool {
    let last = ctx.last_message.clone().or_else(|| {
        ctx.transcript
            .as_deref()
            .and_then(transcript_tail)
            .and_then(|t| hookctx::last_assistant_text(&t))
    });
    last.is_some_and(|t| hookctx::asks_question(&t))
}

/// What a hook wrote to our stdin, if anything (never waits on a terminal, at most 1 s).
fn hook_input() -> Option<String> {
    use std::io::{IsTerminal, Read};
    if std::io::stdin().is_terminal() {
        return None;
    }
    let (tx, rx) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        let mut buf = String::new();
        let _ = std::io::stdin().take(64 * 1024).read_to_string(&mut buf);
        let _ = tx.send(buf);
    });
    rx.recv_timeout(std::time::Duration::from_secs(1))
        .ok()
        .filter(|s| !s.trim().is_empty())
}

/// The start of a chat's transcript (enough to find its first request).
fn transcript_head(path: &Path) -> Option<String> {
    use std::io::Read;
    let mut buf = Vec::new();
    std::fs::File::open(path)
        .ok()?
        .take(256 * 1024)
        .read_to_end(&mut buf)
        .ok()?;
    Some(String::from_utf8_lossy(&buf).into_owned())
}

/// The end of a chat's transcript (enough to find the assistant's last message); the first,
/// probably cut, line is dropped.
fn transcript_tail(path: &Path) -> Option<String> {
    use std::io::{Read, Seek, SeekFrom};
    const TAIL: u64 = 128 * 1024;
    let mut file = std::fs::File::open(path).ok()?;
    let len = file.metadata().ok()?.len();
    let start = len.saturating_sub(TAIL);
    file.seek(SeekFrom::Start(start)).ok()?;
    let mut buf = Vec::new();
    file.take(TAIL).read_to_end(&mut buf).ok()?;
    let text = String::from_utf8_lossy(&buf).into_owned();
    Some(if start > 0 {
        text.split_once('\n')
            .map(|(_, rest)| rest.to_owned())
            .unwrap_or_default()
    } else {
        text
    })
}

/// Details a tool gives on the command line: Codex's `notify` adds the turn as one JSON argument
/// at the end; OpenCode's plugin puts the session's folder in `PLUTO_CWD`.
fn react_extra(args: &[String], cwd: Option<String>) -> Option<String> {
    if let Some(last) = args.last().filter(|a| a.trim_start().starts_with('{')) {
        return Some(last.clone());
    }
    cwd.filter(|c| !c.trim().is_empty())
        .map(|c| serde_json::json!({ "cwd": c }).to_string())
}

/// What the command line asks for, read before Tauri starts.
#[derive(Debug, PartialEq, Eq)]
enum Cli {
    Bridge,
    React(String),
}

fn cli(args: &[String]) -> Option<Cli> {
    if args.iter().any(|a| a == BRIDGE_FLAG) {
        return Some(Cli::Bridge);
    }
    let i = args.iter().position(|a| a == REACT_FLAG)?;
    Some(Cli::React(args.get(i + 1).cloned().unwrap_or_default()))
}

/// Run as the bridge or play a reaction if `args` ask for it; returns the exit code,
/// or `None` to start the app. Called first thing in `main`.
pub fn bridge_main(args: &[String]) -> Option<i32> {
    let what = cli(args)?;
    let assistant = assistant_from(args);
    let extra = react_extra(args, std::env::var("PLUTO_CWD").ok());
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .ok()?;
    Some(runtime.block_on(async move {
        match what {
            Cli::Bridge => {
                let token = token_now();
                let stdio = tokio::io::join(tokio::io::stdin(), tokio::io::stdout());
                let pipe = if token.is_empty() {
                    None
                } else {
                    connect().await
                };
                i32::from(link::bridge(pipe, &token, &assistant, stdio).await.is_err())
            }
            Cli::React(reaction) => {
                react_now(&assistant, &reaction, extra).await;
                0
            }
        }
    }))
}

/// How often, and how far apart, a hook tries the pipe again while Pluto is between two
/// connections (owner 2026-11-03: with three chats the pet stopped saying "done" after a while).
const OPEN_TRIES: u32 = 20;
const OPEN_GAP: std::time::Duration = std::time::Duration::from_millis(50);

/// Whether a failed open is worth another try: every pipe instance busy, or the moment between
/// one connection and the next instance. Anything else (Pluto closed, no access) is final.
fn worth_retrying(e: &std::io::Error) -> bool {
    // ERROR_PIPE_BUSY = 231 on Windows.
    e.raw_os_error() == Some(231)
        || matches!(
            e.kind(),
            std::io::ErrorKind::NotFound | std::io::ErrorKind::WouldBlock
        )
}

/// Opens with `open`, trying again for a short while on [`worth_retrying`] errors.
async fn open_with_retry<T, F, Fut>(mut open: F, tries: u32, gap: std::time::Duration) -> Option<T>
where
    F: FnMut() -> Fut,
    Fut: std::future::Future<Output = std::io::Result<T>>,
{
    for attempt in 1..=tries.max(1) {
        match open().await {
            Ok(pipe) => return Some(pipe),
            Err(e) if attempt < tries && worth_retrying(&e) => tokio::time::sleep(gap).await,
            Err(_) => return None,
        }
    }
    None
}

#[cfg(windows)]
async fn connect() -> Option<tokio::net::windows::named_pipe::NamedPipeClient> {
    let name = pipe_name();
    open_with_retry(
        || async { tokio::net::windows::named_pipe::ClientOptions::new().open(&name) },
        OPEN_TRIES,
        OPEN_GAP,
    )
    .await
}

#[cfg(unix)]
async fn connect() -> Option<tokio::net::UnixStream> {
    let path = data_dir()?.join(SOCKET_FILE);
    // A missing socket means Pluto is not running: no point waiting.
    if !path.exists() {
        return None;
    }
    open_with_retry(
        || tokio::net::UnixStream::connect(&path),
        OPEN_TRIES,
        OPEN_GAP,
    )
    .await
}

#[cfg(not(any(windows, unix)))]
async fn connect() -> Option<tokio::io::DuplexStream> {
    None
}

/// The running Pluto, as the MCP server sees it.
struct ShellHost<R: Runtime> {
    app: AppHandle<R>,
    activity: Arc<Activity>,
    guard: Arc<Guard>,
    asks: Arc<Asks>,
    waits: Arc<WaitList>,
    away: Arc<AwayList>,
    working: Arc<WorkList>,
}

/// Chats waiting for you (A-1), kept here so every hook sees the same list and the pet can ask
/// for it when it opens.
#[derive(Default)]
pub struct WaitList(Mutex<waiting::Waiting>);

impl WaitList {
    /// Applies one change and returns the list after it (what has waited too long is dropped first).
    fn apply(&self, change: WaitChange, now: i64) -> Vec<waiting::Chat> {
        let mut list = self.0.lock().unwrap_or_else(PoisonError::into_inner);
        list.expire(now);
        match change {
            WaitChange::Raise {
                assistant,
                place,
                kind,
                window,
            } => {
                let (folder, detail) = waiting::from_place(place.as_deref());
                list.raise(waiting::Chat {
                    assistant,
                    folder,
                    detail,
                    kind,
                    since: now,
                    window,
                    jump: false,
                });
            }
            WaitChange::Clear { assistant, place } => {
                let (folder, _) = waiting::from_place(place.as_deref());
                list.clear(&assistant, &folder);
            }
        }
        list.list()
    }

    /// The window to bring forward for a chat (A-4); see [`waiting::Waiting::window_of`].
    fn window_of(&self, assistant: &str, folder: Option<&str>) -> Option<i64> {
        self.0
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .window_of(assistant, folder)
    }

    fn current(&self, now: i64) -> Vec<waiting::Chat> {
        let mut list = self.0.lock().unwrap_or_else(PoisonError::into_inner);
        list.expire(now);
        list.list()
    }
}

/// Chats that spoke while the person was away (A-3). Its loop is running only while it has
/// something left to announce.
#[derive(Default)]
pub struct AwayList(Mutex<AwayState>);

#[derive(Default)]
struct AwayState {
    away: away::Away,
    checking: bool,
}

impl AwayList {
    /// Records a missed chat and says whether this caller must start the short-lived check loop.
    fn note(&self, missed: away::Missed, idle_ms: u64, now: i64) -> bool {
        let mut state = self.0.lock().unwrap_or_else(PoisonError::into_inner);
        state.away.note(missed, idle_ms, now);
        if state.away.is_empty() || state.checking {
            return false;
        }
        state.checking = true;
        true
    }

    /// Gives the one welcome-back message, if any, and tells the loop when it can stop.
    fn back(&self, idle_ms: u64, now: i64) -> (Option<String>, bool) {
        let mut state = self.0.lock().unwrap_or_else(PoisonError::into_inner);
        let text = state.away.back(idle_ms, now);
        let keep_checking = !state.away.is_empty();
        if !keep_checking {
            state.checking = false;
        }
        (text, keep_checking)
    }
}

/// Assistant chats in progress (A-7). Its loop is running only while a chat is still working.
#[derive(Default)]
pub struct WorkList(Mutex<WorkState>);

#[derive(Default)]
struct WorkState {
    working: working::Working,
    ticking: bool,
}

impl WorkList {
    /// Applies a hook change and says whether this caller must start the one-minute loop.
    fn apply(&self, change: WorkChange, now: i64) -> bool {
        let mut state = self.0.lock().unwrap_or_else(PoisonError::into_inner);
        match change {
            WorkChange::Start { assistant, place } => {
                let (folder, _) = waiting::from_place(place.as_deref());
                state.working.start(assistant, folder, now);
            }
            WorkChange::End { assistant, place } => {
                let (folder, _) = waiting::from_place(place.as_deref());
                state.working.end(&assistant, &folder);
            }
        }
        if !state.working.should_tick() || state.ticking {
            return false;
        }
        state.ticking = true;
        true
    }

    /// Notices due now and says whether the one-minute loop should continue.
    fn due(&self, now: i64) -> (Vec<working::Notice>, bool) {
        let mut state = self.0.lock().unwrap_or_else(PoisonError::into_inner);
        let notices = state.working.due(now);
        let keep_ticking = state.working.should_tick();
        if !keep_ticking {
            state.ticking = false;
        }
        (notices, keep_ticking)
    }
}

/// Questions waiting on the pet for a button press, by id.
#[derive(Default)]
pub struct Asks {
    next: std::sync::atomic::AtomicU64,
    waiting: Mutex<std::collections::HashMap<u64, tokio::sync::oneshot::Sender<String>>>,
}

impl Asks {
    fn open(&self) -> (u64, tokio::sync::oneshot::Receiver<String>) {
        let id = self.next.fetch_add(1, Ordering::SeqCst) + 1;
        let (tx, rx) = tokio::sync::oneshot::channel();
        self.waiting
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .insert(id, tx);
        (id, rx)
    }

    /// The person pressed `answer`; false when the question was no longer waiting.
    fn answer(&self, id: u64, answer: String) -> bool {
        let tx = self
            .waiting
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .remove(&id);
        tx.is_some_and(|tx| tx.send(answer).is_ok())
    }

    fn forget(&self, id: u64) {
        self.waiting
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .remove(&id);
    }
}

/// The focus guard (owner 2026-11-02, off by default): while it is on and a focus session runs,
/// assistants' pet messages wait here and show when the session ends.
#[derive(Default)]
pub struct Guard {
    on: AtomicBool,
    focusing: AtomicBool,
    held: Mutex<Vec<PetMessage>>,
}

impl Guard {
    /// Keeps the message back if the guard applies now.
    fn hold(&self, message: &PetMessage) -> bool {
        if !(self.on.load(Ordering::Relaxed) && self.focusing.load(Ordering::Relaxed)) {
            return false;
        }
        self.held
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .push(message.clone());
        true
    }

    /// What waited, in order; empty afterwards.
    fn release(&self) -> Vec<PetMessage> {
        std::mem::take(&mut *self.held.lock().unwrap_or_else(PoisonError::into_inner))
    }
}

/// The pet's bubble for a message: reactions read as they are, a `say` with the assistant's name.
fn bubble(message: PetMessage) -> String {
    if message.reaction.is_some() || message.assistant.is_empty() {
        message.text
    } else {
        format!("{}: {}", message.assistant, message.text)
    }
}

/// The bubble's action id for "take me to that chat"; the pet sends it back to `pet_focus_chat`.
const CHAT_GO: &str = "chat-go:";

fn show_on_pet<R: Runtime>(app: &AppHandle<R>, message: PetMessage, go: bool) {
    let assistant = message.assistant.clone();
    let mut say = serde_json::json!({ "text": bubble(message) });
    if go {
        say["actionId"] = format!("{CHAT_GO}{assistant}").into();
        say["actionLabel"] = "go to it".into();
    }
    let _ = app.emit("pet://say", say);
}

/// Where the request log and its Undo are kept on this computer.
const ACTIVITY_PREF: &str = "mcp.activity";

/// Saves the log (with each change's Undo) and tells the page.
fn save_activity<R: Runtime>(app: &AppHandle<R>, activity: &Activity) {
    let saved = activity.saved();
    if let Some(settings) = app.try_state::<Arc<SettingsService>>() {
        let settings = Arc::clone(&settings);
        tauri::async_runtime::spawn(async move {
            let _ = settings.set_pref(ACTIVITY_PREF, saved).await;
        });
    }
    let _ = app.emit("mcp://activity", ());
}

fn now_ms<R: Runtime>(app: &AppHandle<R>) -> i64 {
    app.try_state::<crate::Core>()
        .map(|core| core.clock.now_ms())
        .unwrap_or_default()
}

/// Input idle time using the same media-aware rule as time tracking. Unsupported targets are
/// deliberately treated as active: A-3 must not announce an away event without a real probe.
fn effective_idle() -> u64 {
    #[cfg(windows)]
    {
        crate::tracking::win::idle_ms()
            .map(|idle| {
                pluto_core::usage::effective_idle_ms(idle, crate::tracking::win::display_required())
            })
            .unwrap_or_default()
    }
    #[cfg(target_os = "macos")]
    {
        crate::tracking::mac::idle_ms()
            .map(|idle| pluto_core::usage::effective_idle_ms(idle, false))
            .unwrap_or_default()
    }
    #[cfg(not(any(windows, target_os = "macos")))]
    {
        0
    }
}

impl<R: Runtime> Host for ShellHost<R> {
    fn status(&self) -> HostFuture<'_, Status> {
        // The focus session and today's tasks; the app in front comes with the read tools (P4.1b).
        Box::pin(async move {
            let Some(core) = self.app.try_state::<crate::Core>() else {
                return Status::default();
            };
            pluto_core::mcp::status::read(&core.db, &*core.clock, None).await
        })
    }

    fn show(&self, message: PetMessage) {
        // A "needs you" or permission bubble can take you to that chat when its window is known (A-4).
        let go = matches!(
            message.reaction,
            Some("agent_needs_you" | "agent_permission")
        ) && self.waits.window_of(&message.assistant, None).is_some();
        show_on_pet(&self.app, message, go);
    }

    fn hold(&self, message: &PetMessage) -> bool {
        self.guard.hold(message)
    }

    fn waiting(&self, change: WaitChange) {
        let list = self.waits.apply(change, now_ms(&self.app));
        let _ = self.app.emit("pet://waiting", &list);
    }

    fn finished(&self, assistant: String, place: Option<String>, kind: &'static str) {
        let kind = match kind {
            "done" => away::Kind::Finished,
            "needs" => away::Kind::Needs,
            "permission" => away::Kind::Permission,
            _ => return,
        };
        let (folder, _) = waiting::from_place(place.as_deref());
        let now = now_ms(&self.app);
        let start = self.away.note(
            away::Missed {
                assistant,
                folder,
                kind,
                at_ms: now,
            },
            effective_idle(),
            now,
        );
        if !start {
            return;
        }
        let app = self.app.clone();
        let away = self.away.clone();
        let guard = self.guard.clone();
        tauri::async_runtime::spawn(async move {
            loop {
                tokio::time::sleep(std::time::Duration::from_secs(5)).await;
                let (text, keep_checking) = away.back(effective_idle(), now_ms(&app));
                if let Some(text) = text {
                    let message = PetMessage {
                        assistant: String::new(),
                        text,
                        reaction: None,
                    };
                    if !guard.hold(&message) {
                        show_on_pet(&app, message, false);
                    }
                }
                if !keep_checking {
                    return;
                }
            }
        });
    }

    fn working(&self, change: WorkChange) {
        if !self.working.apply(change, now_ms(&self.app)) {
            return;
        }
        let app = self.app.clone();
        let working = self.working.clone();
        let guard = self.guard.clone();
        tauri::async_runtime::spawn(async move {
            loop {
                tokio::time::sleep(std::time::Duration::from_secs(60)).await;
                let (notices, keep_ticking) = working.due(now_ms(&app));
                for notice in notices {
                    let Some(text) = notice.text() else {
                        continue;
                    };
                    let message = PetMessage {
                        assistant: String::new(),
                        text,
                        reaction: None,
                    };
                    if !guard.hold(&message) {
                        show_on_pet(&app, message, false);
                    }
                }
                if !keep_ticking {
                    return;
                }
            }
        });
    }

    fn ask(&self, question: Question) -> HostFuture<'_, Option<String>> {
        Box::pin(async move {
            // Only a pet on screen can be asked.
            let pet = self.app.get_webview_window(crate::pet::LABEL)?;
            if !pet.is_visible().unwrap_or(false) {
                return None;
            }
            let (id, answer) = self.asks.open();
            let _ = self.app.emit_to(
                crate::pet::LABEL,
                "pet://ask",
                serde_json::json!({ "id": id, "title": question.title, "detail": question.detail, "options": question.options }),
            );
            match tokio::time::timeout(ANSWER_WAIT, answer).await {
                Ok(Ok(chosen)) => Some(chosen),
                _ => {
                    self.asks.forget(id);
                    let _ = self.app.emit_to(crate::pet::LABEL, "pet://ask-done", id);
                    None
                }
            }
        })
    }

    fn changed(&self, tool: &'static str, assistant: &str, change: Change) {
        self.activity.record_change(
            Call {
                at_ms: now_ms(&self.app),
                assistant: assistant.to_owned(),
                tool: tool.to_owned(),
                ok: true,
                detail: change.summary,
                changed: true,
                undo_id: None,
                undone: false,
            },
            change.undo,
        );
        save_activity(&self.app, &self.activity);
    }

    fn data(&self) -> Option<pluto_core::mcp::read::Data> {
        let core = self.app.try_state::<crate::Core>()?;
        Some(pluto_core::mcp::read::Data {
            db: core.db.clone(),
            clock: core.clock.clone(),
            settings: self
                .app
                .try_state::<Arc<SettingsService>>()
                .map(|s| Arc::clone(&s)),
        })
    }

    fn record(&self, tool: &'static str, assistant: &str, ok: bool, detail: String) {
        self.activity.record(Call {
            at_ms: now_ms(&self.app),
            assistant: assistant.to_owned(),
            tool: tool.to_owned(),
            ok,
            detail,
            changed: false,
            undo_id: None,
            undone: false,
        });
        save_activity(&self.app, &self.activity);
    }
}

/// Each assistant's rate limit, shared by its connections for the life of the app.
#[derive(Default)]
struct Limits(Mutex<std::collections::HashMap<String, Arc<RateLimit>>>);

impl Limits {
    fn for_id(&self, id: &str) -> Arc<RateLimit> {
        self.0
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .entry(id.to_owned())
            .or_default()
            .clone()
    }
}

/// Writes this run's token where only this user can read it.
fn write_token(dir: &Path, token: &str) -> std::io::Result<()> {
    let path = dir.join(TOKEN_FILE);
    std::fs::write(&path, token)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600))?;
    }
    Ok(())
}

/// Removes the token (and the socket) so a stale bridge can never get in.
pub fn forget(dir: &Path) {
    let _ = std::fs::remove_file(dir.join(TOKEN_FILE));
    #[cfg(unix)]
    let _ = std::fs::remove_file(dir.join(SOCKET_FILE));
}

/// The MCP side of the running app: the recent calls and the listener while switched on.
#[derive(Default)]
pub struct Mcp {
    activity: Arc<Activity>,
    guard: Arc<Guard>,
    asks: Arc<Asks>,
    waits: Arc<WaitList>,
    away: Arc<AwayList>,
    working: Arc<WorkList>,
    listener: Mutex<Option<tauri::async_runtime::JoinHandle<()>>>,
}

impl Mcp {
    fn listening(&self) -> bool {
        self.listener
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .is_some()
    }

    /// Stops listening (if it was) and removes the token, so no bridge can get in.
    fn stop(&self, dir: &Path) {
        if let Some(task) = self
            .listener
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .take()
        {
            task.abort();
        }
        forget(dir);
    }
}

/// The pet side of Pluto, for reactions raised inside Pluto itself (the git watcher).
pub fn shell_host<R: Runtime>(app: &AppHandle<R>, mcp: &Mcp) -> Arc<dyn Host> {
    Arc::new(ShellHost {
        app: app.clone(),
        activity: mcp.activity.clone(),
        guard: mcp.guard.clone(),
        asks: mcp.asks.clone(),
        waits: mcp.waits.clone(),
        away: mcp.away.clone(),
        working: mcp.working.clone(),
    })
}

/// Starts listening for bridges with a fresh token.
fn listen_now<R: Runtime>(app: &AppHandle<R>, mcp: &Mcp, data_dir: &Path) {
    mcp.stop(data_dir);
    let token = link::new_token();
    if let Err(e) = write_token(data_dir, &token) {
        tracing::warn!(error = %e, "MCP: could not write the token; assistants cannot connect");
        return;
    }
    let host: Arc<dyn Host> = Arc::new(ShellHost {
        app: app.clone(),
        activity: mcp.activity.clone(),
        guard: mcp.guard.clone(),
        asks: mcp.asks.clone(),
        waits: mcp.waits.clone(),
        away: mcp.away.clone(),
        working: mcp.working.clone(),
    });
    let limits = Arc::new(Limits::default());
    let dir = data_dir.to_owned();
    let task = tauri::async_runtime::spawn(keep_listening(
        move || {
            let (dir, token, host, limits) =
                (dir.clone(), token.clone(), host.clone(), limits.clone());
            async move { listen(&dir, token, host, limits).await }
        },
        std::time::Duration::from_millis(250),
    ));
    *mcp.listener.lock().unwrap_or_else(PoisonError::into_inner) = Some(task);
}

fn flag(all: &std::collections::BTreeMap<String, serde_json::Value>, key: &str) -> bool {
    all.get(key).and_then(serde_json::Value::as_bool) == Some(true)
}

/// Follows `mcp.enabled`: listens while it is on, stops and removes the token when it goes off.
/// Expects [`Mcp`] in the app's state.
pub fn start(app: AppHandle, settings: Arc<SettingsService>, bus: &EventBus, data_dir: PathBuf) {
    let mut events = bus.subscribe();
    tauri::async_runtime::spawn(async move {
        let mcp = app.state::<Mcp>();
        forget(&data_dir);
        // The log from last time, with its Undo.
        if let Ok(Some(saved)) = settings.get_pref(ACTIVITY_PREF).await {
            mcp.activity.restore(&saved);
        }
        let mut on = false;
        if let Some(core) = app.try_state::<crate::Core>() {
            let running = pluto_core::focus::current(&core.db, &*core.clock)
                .await
                .ok()
                .flatten()
                .is_some();
            mcp.guard.focusing.store(running, Ordering::Relaxed);
        }
        loop {
            let all = settings.get_all().await.unwrap_or_default();
            mcp.guard
                .on
                .store(flag(&all, "mcp.focus_guard"), Ordering::Relaxed);
            let want = flag(&all, "mcp.enabled");
            if want != on {
                on = want;
                if on {
                    listen_now(&app, &mcp, &data_dir);
                } else {
                    mcp.stop(&data_dir);
                }
                let _ = app.emit("mcp://activity", ());
            }
            match events.recv().await {
                Recv::Event(Event::SettingChanged { key, .. }) if key.starts_with("mcp.") => {}
                Recv::Event(Event::FocusChanged { .. }) => {
                    mcp.guard.focusing.store(true, Ordering::Relaxed);
                    continue;
                }
                Recv::Event(Event::FocusEnded { .. }) => {
                    mcp.guard.focusing.store(false, Ordering::Relaxed);
                    // What waited shows now; more than one reads as one bubble.
                    let waited = mcp.guard.release();
                    let count = waited.len();
                    if let Some(last) = waited.into_iter().last() {
                        show_on_pet(&app, last, false);
                        if count > 1 {
                            let _ = app.emit(
                                "pet://say",
                                serde_json::json!({ "text": format!("{} more from your assistants while you focused", count - 1) }),
                            );
                        }
                    }
                    continue;
                }
                Recv::Event(Event::AllDataDeleted { .. }) => {
                    // "Delete all my data" includes what assistants did.
                    mcp.activity.restore(&serde_json::json!([]));
                    save_activity(&app, &mcp.activity);
                }
                Recv::Resync { .. } => {}
                Recv::Event(_) => continue,
                Recv::Closed => break,
            }
        }
    });
}

/// One settings file an assistant reads its MCP servers from.
#[derive(Debug, Clone)]
struct Place {
    /// "Claude Code", "Claude app"…
    label: &'static str,
    path: PathBuf,
    format: Format,
    /// The id the bridge is started with, so the pet shows the right name.
    id: &'static str,
    /// True when the file itself must exist to count as installed (its folder is the home).
    needs_file: bool,
}

impl Place {
    fn installed(&self) -> bool {
        if self.needs_file {
            self.path.is_file()
        } else {
            self.path.parent().is_some_and(Path::is_dir)
        }
    }
    fn args(&self) -> Vec<String> {
        vec![BRIDGE_FLAG.into(), "--assistant".into(), self.id.into()]
    }
}

/// The assistants Pluto can set up, by id: (name, what it covers).
const ASSISTANTS: &[(&str, &str)] = &[
    ("claude", "Claude"),
    ("codex", "Codex"),
    ("cursor", "Cursor"),
    ("vscode", "VS Code"),
    ("opencode", "OpenCode"),
    ("windsurf", "Windsurf"),
];

/// Where each assistant keeps its settings under these folders (home, and the OS's config folder:
/// %APPDATA%, ~/Library/Application Support, or ~/.config).
fn places_in(id: &str, home: &Path, config: &Path, local: Option<&Path>) -> Vec<Place> {
    match id {
        // One setup for both: Claude Code and the Claude app (every copy of its settings folder).
        "claude" => {
            let mut list = vec![Place {
                label: "Claude Code",
                path: home.join(".claude.json"),
                format: Format::McpServers,
                id: "claude-code",
                needs_file: true,
            }];
            list.extend(claude_app_dirs(config, local).into_iter().map(|dir| Place {
                label: "Claude app",
                path: dir.join("claude_desktop_config.json"),
                format: Format::McpServers,
                id: "claude-desktop",
                needs_file: false,
            }));
            list
        }
        "vscode" => vec![Place {
            label: "VS Code",
            path: config.join("Code").join("User").join("mcp.json"),
            format: Format::VsCode,
            id: "vscode",
            needs_file: false,
        }],
        "cursor" => vec![Place {
            label: "Cursor",
            path: home.join(".cursor").join("mcp.json"),
            format: Format::McpServers,
            id: "cursor",
            needs_file: false,
        }],
        // Codex (CLI and app) share one `config.toml` in CODEX_HOME (default ~/.codex).
        "codex" => {
            let dir = codex_dir(home);
            vec![Place {
                label: "Codex",
                path: dir.join("config.toml"),
                format: Format::CodexToml,
                id: "codex",
                needs_file: false,
            }]
        }
        "opencode" => vec![Place {
            label: "OpenCode",
            path: opencode_dir(home).join("opencode.json"),
            format: Format::OpenCode,
            id: "opencode",
            needs_file: false,
        }],
        // Windsurf's settings moved when it joined Devin: write the editor's file and, where it
        // exists, the Devin one too (Windows: %APPDATA%\devin; elsewhere ~/.config/devin).
        "windsurf" => {
            let mut list = vec![Place {
                label: "Windsurf",
                path: home
                    .join(".codeium")
                    .join("windsurf")
                    .join("mcp_config.json"),
                format: Format::McpServers,
                id: "windsurf",
                needs_file: false,
            }];
            let devin = if cfg!(windows) {
                config.join("devin")
            } else {
                home.join(".config").join("devin")
            };
            list.push(Place {
                label: "Windsurf (Devin)",
                path: devin.join("mcp_config.json"),
                format: Format::McpServers,
                id: "windsurf",
                needs_file: false,
            });
            list
        }
        _ => Vec::new(),
    }
}

/// Codex's folder: `CODEX_HOME`, else `~/.codex`.
fn codex_dir(home: &Path) -> PathBuf {
    std::env::var_os("CODEX_HOME")
        .filter(|d| !d.is_empty())
        .map(PathBuf::from)
        .unwrap_or_else(|| home.join(".codex"))
}

/// Codex's `hooks.json` (the pet waves when Codex is about to ask you to approve something),
/// when Codex's folder exists.
fn codex_hooks_file(home: &Path) -> Option<PathBuf> {
    let dir = codex_dir(home);
    dir.is_dir().then(|| dir.join("hooks.json"))
}

fn add_codex_hooks(file: &Path, program: &str) -> Result<(), String> {
    let text = setup::add_codex_hooks(read_text(file).as_deref(), program)
        .map_err(|why| format!("Codex hooks: {why}"))?;
    write_safely(file, &text).map_err(|e| format!("Codex hooks: Pluto could not save them ({e})."))
}

fn remove_codex_hooks(file: &Path) -> Result<(), String> {
    let Some(text) = read_text(file) else {
        return Ok(());
    };
    match setup::remove_codex_hooks(Some(&text)).map_err(|why| format!("Codex hooks: {why}"))? {
        Some(text) => write_safely(file, &text)
            .map_err(|e| format!("Codex hooks: Pluto could not save them ({e}).")),
        None => Ok(()),
    }
}

/// OpenCode's config folder: `~/.config/opencode` on every system.
fn opencode_dir(home: &Path) -> PathBuf {
    home.join(".config").join("opencode")
}

/// The Claude app's settings folders: the usual one, plus on Windows the folder of a Store or
/// MSIX install (`%LOCALAPPDATA%\Packages\Claude_*\LocalCache\Roaming\Claude`), which is the
/// one such an install really reads; writing only the usual one left Pluto out of the app.
fn claude_app_dirs(config: &Path, local: Option<&Path>) -> Vec<PathBuf> {
    let mut dirs = vec![config.join("Claude")];
    if let Some(Ok(entries)) = local.map(|l| std::fs::read_dir(l.join("Packages"))) {
        let mut found: Vec<PathBuf> = entries
            .flatten()
            .filter(|e| e.file_name().to_string_lossy().starts_with("Claude_"))
            .map(|e| e.path().join("LocalCache").join("Roaming").join("Claude"))
            .filter(|d| d.is_dir())
            .collect();
        found.sort();
        dirs.extend(found);
    }
    dirs
}

fn os_folders() -> Option<(PathBuf, PathBuf)> {
    let home = std::env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" })
        .filter(|h| !h.is_empty())
        .map(PathBuf::from)?;
    let config = if cfg!(windows) {
        PathBuf::from(std::env::var_os("APPDATA")?)
    } else if cfg!(target_os = "macos") {
        home.join("Library/Application Support")
    } else {
        std::env::var_os("XDG_CONFIG_HOME")
            .map(PathBuf::from)
            .unwrap_or_else(|| home.join(".config"))
    };
    Some((home, config))
}

fn places(id: &str) -> Vec<Place> {
    os_folders()
        .map(|(home, config)| {
            let local = if cfg!(windows) {
                std::env::var_os("LOCALAPPDATA").map(PathBuf::from)
            } else {
                None
            };
            places_in(id, &home, &config, local.as_deref())
        })
        .unwrap_or_default()
}

fn read_text(path: &Path) -> Option<String> {
    std::fs::read_to_string(path).ok()
}

/// Writes through a temporary file and a rename, so a crash never leaves half a file. The first
/// time Pluto changes a file, the original is kept next to it as `<name>.pluto-backup`.
fn write_safely(path: &Path, text: &str) -> std::io::Result<()> {
    if path.is_file() {
        let backup = path.with_file_name(format!(
            "{}.pluto-backup",
            path.file_name().unwrap_or_default().to_string_lossy()
        ));
        if !backup.exists() {
            std::fs::copy(path, &backup)?;
        }
    }
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir)?;
    }
    let tmp = path.with_extension("pluto-tmp");
    std::fs::write(&tmp, text)?;
    std::fs::rename(&tmp, path)
}

/// Adds Pluto to every installed place; the labels it was added to.
fn connect_places(places: &[Place], command: &str) -> Result<Vec<&'static str>, String> {
    let mut done = Vec::new();
    for place in places.iter().filter(|p| p.installed()) {
        let text = setup::add(
            read_text(&place.path).as_deref(),
            place.format,
            command,
            &place.args(),
        )
        .map_err(|why| format!("{}: {why}", place.label))?;
        write_safely(&place.path, &text)
            .map_err(|e| format!("{}: Pluto could not save its settings ({e}).", place.label))?;
        done.push(place.label);
    }
    Ok(done)
}

/// Claude Code's settings file for hooks, when Claude Code is installed (its folder exists).
fn claude_hooks_file(home: &Path) -> Option<PathBuf> {
    let dir = home.join(".claude");
    dir.is_dir().then(|| dir.join("settings.json"))
}

/// Adds the pet's Claude Code hooks (done, needs you).
fn add_claude_hooks(file: &Path, program: &str) -> Result<(), String> {
    let text = setup::add_hooks(read_text(file).as_deref(), program)
        .map_err(|why| format!("Claude Code hooks: {why}"))?;
    write_safely(file, &text)
        .map_err(|e| format!("Claude Code hooks: Pluto could not save them ({e})."))
}

fn remove_claude_hooks(file: &Path) -> Result<(), String> {
    let Some(text) = read_text(file) else {
        return Ok(());
    };
    match setup::remove_hooks(Some(&text)).map_err(|why| format!("Claude Code hooks: {why}"))? {
        Some(text) => write_safely(file, &text)
            .map_err(|e| format!("Claude Code hooks: Pluto could not save them ({e}).")),
        None => Ok(()),
    }
}

/// Cursor's hooks file (the pet cheers when the agent stops), when Cursor's folder exists.
fn cursor_hooks_file(home: &Path) -> Option<PathBuf> {
    let dir = home.join(".cursor");
    dir.is_dir().then(|| dir.join("hooks.json"))
}

fn add_cursor_hooks(file: &Path, program: &str) -> Result<(), String> {
    let text = setup::add_cursor_hooks(read_text(file).as_deref(), program)
        .map_err(|why| format!("Cursor hooks: {why}"))?;
    write_safely(file, &text).map_err(|e| format!("Cursor hooks: Pluto could not save them ({e})."))
}

fn remove_cursor_hooks(file: &Path) -> Result<(), String> {
    let Some(text) = read_text(file) else {
        return Ok(());
    };
    match setup::remove_cursor_hooks(Some(&text)).map_err(|why| format!("Cursor hooks: {why}"))? {
        Some(text) => write_safely(file, &text)
            .map_err(|e| format!("Cursor hooks: Pluto could not save them ({e}).")),
        None => Ok(()),
    }
}

/// Where Pluto's OpenCode plugin goes (OpenCode loads every file in this folder at start).
fn opencode_plugin_file(home: &Path) -> Option<PathBuf> {
    let dir = opencode_dir(home);
    dir.is_dir()
        .then(|| dir.join("plugins").join("pluto-pet.js"))
}

fn add_opencode_plugin(file: &Path, program: &str) -> Result<(), String> {
    // A file with that name that Pluto did not write is never overwritten.
    if let Some(old) = read_text(file) {
        if !old.starts_with(setup::OPENCODE_PLUGIN_MARK) {
            return Err("OpenCode plugin: a file named pluto-pet.js is already there and Pluto did not write it, so Pluto left it alone.".into());
        }
    }
    if let Some(dir) = file.parent() {
        std::fs::create_dir_all(dir)
            .map_err(|e| format!("OpenCode plugin: Pluto could not make the folder ({e})."))?;
    }
    write_safely(file, &setup::opencode_plugin(program))
        .map_err(|e| format!("OpenCode plugin: Pluto could not save it ({e})."))
}

fn remove_opencode_plugin(file: &Path) -> Result<(), String> {
    if read_text(file).is_some_and(|t| t.starts_with(setup::OPENCODE_PLUGIN_MARK)) {
        std::fs::remove_file(file)
            .map_err(|e| format!("OpenCode plugin: Pluto could not remove it ({e})."))?;
    }
    Ok(())
}

/// Takes Pluto out of every place it is in.
fn disconnect_places(places: &[Place]) -> Result<(), String> {
    for place in places {
        let Some(text) = read_text(&place.path) else {
            continue;
        };
        if let Some(text) = setup::remove(Some(&text), place.format)
            .map_err(|why| format!("{}: {why}", place.label))?
        {
            write_safely(&place.path, &text).map_err(|e| {
                format!("{}: Pluto could not save its settings ({e}).", place.label)
            })?;
        }
    }
    Ok(())
}

/// One place, as the assistant's settings show it.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaceInfo {
    pub label: String,
    pub path: String,
    pub installed: bool,
    pub connected: bool,
    /// The block to paste by hand.
    pub manual: String,
}

/// One assistant tile.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AssistantInfo {
    pub id: String,
    pub name: String,
    /// Found on this computer.
    pub installed: bool,
    /// Pluto is in its settings (in every place that is installed).
    pub connected: bool,
    pub places: Vec<PlaceInfo>,
}

fn this_program() -> String {
    std::env::current_exe()
        .map(|p| p.to_string_lossy().into_owned())
        .unwrap_or_else(|_| "Pluto".into())
}

fn describe(id: &str, name: &str, places: &[Place], command: &str) -> AssistantInfo {
    let infos: Vec<PlaceInfo> = places
        .iter()
        .map(|p| PlaceInfo {
            label: p.label.into(),
            path: p.path.to_string_lossy().into_owned(),
            installed: p.installed(),
            connected: setup::is_set(read_text(&p.path).as_deref(), p.format, command),
            manual: setup::manual(p.format, command, &p.args()),
        })
        .collect();
    let installed: Vec<&PlaceInfo> = infos.iter().filter(|p| p.installed).collect();
    AssistantInfo {
        id: id.into(),
        name: name.into(),
        installed: !installed.is_empty(),
        connected: !installed.is_empty() && installed.iter().all(|p| p.connected),
        places: infos,
    }
}

#[tauri::command]
pub fn mcp_assistants() -> Vec<AssistantInfo> {
    let command = this_program();
    ASSISTANTS
        .iter()
        .map(|(id, name)| describe(id, name, &places(id), &command))
        .collect()
}

/// Adds Pluto to the assistant's settings and switches assistants on.
#[tauri::command]
pub async fn mcp_connect(
    settings: State<'_, Arc<SettingsService>>,
    id: String,
) -> Result<Vec<String>, String> {
    let places = places(&id);
    if !places.iter().any(Place::installed) {
        return Err("Pluto could not find this assistant on this computer. Open its settings here for the manual setup.".into());
    }
    let program = this_program();
    let mut done = connect_places(&places, &program)?;
    if id == "claude" {
        if let Some(file) = os_folders().and_then(|(home, _)| claude_hooks_file(&home)) {
            add_claude_hooks(&file, &program)?;
            done.push("Claude Code hooks");
        }
    }
    // The pet's "done" for tools that have a hook of their own (H-1..H-3). Codex's lives in the
    // same file as its server entry (`notify`), so there is nothing more to add for it.
    if id == "cursor" {
        if let Some(file) = os_folders().and_then(|(home, _)| cursor_hooks_file(&home)) {
            add_cursor_hooks(&file, &program)?;
            done.push("Cursor hooks");
        }
    }
    if id == "codex" {
        if let Some(file) = os_folders().and_then(|(home, _)| codex_hooks_file(&home)) {
            add_codex_hooks(&file, &program)?;
            done.push("Codex approval hook");
        }
    }
    if id == "opencode" {
        if let Some(file) = os_folders().and_then(|(home, _)| opencode_plugin_file(&home)) {
            add_opencode_plugin(&file, &program)?;
            done.push("OpenCode plugin");
        }
    }
    settings
        .set("mcp.enabled", serde_json::Value::Bool(true))
        .await
        .map_err(|e| e.message)?;
    Ok(done.into_iter().map(String::from).collect())
}

/// Takes Pluto out of the assistant's settings.
#[tauri::command]
pub fn mcp_disconnect(id: String) -> Result<(), String> {
    disconnect_places(&places(&id))?;
    if id == "claude" {
        if let Some(file) = os_folders().and_then(|(home, _)| claude_hooks_file(&home)) {
            remove_claude_hooks(&file)?;
        }
    }
    if id == "cursor" {
        if let Some(file) = os_folders().and_then(|(home, _)| cursor_hooks_file(&home)) {
            remove_cursor_hooks(&file)?;
        }
    }
    if id == "codex" {
        if let Some(file) = os_folders().and_then(|(home, _)| codex_hooks_file(&home)) {
            remove_codex_hooks(&file)?;
        }
    }
    if id == "opencode" {
        if let Some(file) = os_folders().and_then(|(home, _)| opencode_plugin_file(&home)) {
            remove_opencode_plugin(&file)?;
        }
    }
    Ok(())
}

/// The lines to copy for developer reactions outside an assistant: a git hook and a build.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeveloperLines {
    /// Put in `.git/hooks/post-commit` of a project.
    pub git_commit: String,
    /// Put in `.git/hooks/pre-push`.
    pub git_push: String,
    /// Run a build this way.
    pub build: String,
    /// For any other assistant's hooks (owner 2026-11-03: "even when I set up another app"):
    /// "it is done", "it needs you", "it wants permission". Change `my-app` to its name.
    pub agent_done: String,
    pub agent_needs_you: String,
    pub agent_permission: String,
}

pub fn developer_lines(program: &str) -> DeveloperLines {
    let p = program.replace('\\', "/");
    DeveloperLines {
        git_commit: format!("#!/bin/sh\n\"{p}\" --react git_commit --assistant git\n"),
        git_push: format!("#!/bin/sh\n\"{p}\" --react git_push --assistant git\n"),
        build: format!("<your build> && \"{p}\" --react build_ok --assistant build || \"{p}\" --react build_failed --assistant build"),
        agent_done: format!("\"{p}\" --react agent_done --assistant my-app"),
        agent_needs_you: format!("\"{p}\" --react agent_needs_you --assistant my-app"),
        agent_permission: format!("\"{p}\" --react agent_permission --assistant my-app"),
    }
}

#[tauri::command]
pub fn mcp_developer() -> DeveloperLines {
    developer_lines(&this_program())
}

/// True while Pluto is listening for assistants.
#[tauri::command]
pub fn mcp_listening(mcp: State<'_, Mcp>) -> bool {
    mcp.listening()
}

/// The chats waiting for you right now (the pet asks when it opens; changes come as `pet://waiting`).
#[tauri::command]
pub fn pet_waiting(app: AppHandle, mcp: State<'_, Mcp>) -> Vec<waiting::Chat> {
    mcp.waits.current(now_ms(&app))
}

/// Click on a waiting chat (its bubble or its row on the pet): bring the window it runs in to the
/// front (A-4). `folder` is empty for a bubble, which only knows the assistant. False when the
/// window is not known or is gone; the pet then says so.
#[tauri::command]
pub fn pet_focus_chat(mcp: State<'_, Mcp>, assistant: String, folder: Option<String>) -> bool {
    let folder = folder.filter(|f| !f.is_empty());
    mcp.waits
        .window_of(&assistant, folder.as_deref())
        .is_some_and(crate::jump::bring_forward)
}

/// The person pressed a button on a question the pet showed.
#[tauri::command]
pub fn pet_answer(mcp: State<'_, Mcp>, id: u64, answer: String) -> bool {
    mcp.asks.answer(id, answer)
}

/// Puts one assistant change back (the Undo next to it on the Assistants page).
#[tauri::command]
pub async fn mcp_undo(app: AppHandle, mcp: State<'_, Mcp>, id: u64) -> Result<String, String> {
    let Some(undo) = mcp.activity.undo_for(id) else {
        return Err("That change was already undone.".into());
    };
    let core = app
        .try_state::<crate::Core>()
        .ok_or("Pluto is still starting.")?;
    let data = pluto_core::mcp::read::Data {
        db: core.db.clone(),
        clock: core.clock.clone(),
        settings: app
            .try_state::<Arc<SettingsService>>()
            .map(|s| Arc::clone(&s)),
    };
    let said = write::undo(&data, &undo).await?;
    mcp.activity.mark_undone(id);
    save_activity(&app, &mcp.activity);
    Ok(said)
}

#[tauri::command]
pub fn mcp_activity(mcp: State<'_, Mcp>) -> Vec<Call> {
    mcp.activity.recent()
}

/// Runs `listen` for the life of the app: if the pipe ever stops (it used to, for good, after one
/// bad connection), it is opened again after a short wait instead of the pet going quiet until a
/// restart. Stopped only by aborting the task (assistants turned off).
async fn keep_listening<F, Fut>(mut listen: F, first_wait: std::time::Duration)
where
    F: FnMut() -> Fut,
    Fut: std::future::Future<Output = std::io::Result<()>>,
{
    let mut wait = first_wait;
    loop {
        match listen().await {
            Ok(()) => return,
            Err(e) => {
                tracing::warn!(error = %e, "MCP: the private pipe stopped; opening it again");
                tokio::time::sleep(wait).await;
                wait = (wait * 2).min(std::time::Duration::from_secs(10));
            }
        }
    }
}

#[cfg(windows)]
async fn listen(
    _dir: &Path,
    token: String,
    host: Arc<dyn Host>,
    limits: Arc<Limits>,
) -> std::io::Result<()> {
    use tokio::net::windows::named_pipe::ServerOptions;
    let name = pipe_name();
    let mut server = ServerOptions::new()
        .first_pipe_instance(true)
        .reject_remote_clients(true)
        .create(&name)?;
    loop {
        // A hook that opened the pipe and closed it before Pluto got to it (ERROR_NO_DATA) only
        // loses that one connection; the next instance keeps listening.
        let connected = server.connect().await;
        let client = server;
        server = ServerOptions::new()
            .reject_remote_clients(true)
            .create(&name)?;
        match connected {
            Ok(()) => serve_one(client, token.clone(), host.clone(), limits.clone()),
            Err(e) => tracing::debug!(error = %e, "MCP: a connection closed before it started"),
        }
    }
}

#[cfg(unix)]
async fn listen(
    dir: &Path,
    token: String,
    host: Arc<dyn Host>,
    limits: Arc<Limits>,
) -> std::io::Result<()> {
    use std::os::unix::fs::PermissionsExt;
    let path = dir.join(SOCKET_FILE);
    let listener = tokio::net::UnixListener::bind(&path)?;
    std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600))?;
    loop {
        match listener.accept().await {
            Ok((stream, _)) => serve_one(stream, token.clone(), host.clone(), limits.clone()),
            // Too many open files and the like pass; one bad accept must not end the pipe.
            Err(e) => {
                tracing::debug!(error = %e, "MCP: a connection failed");
                tokio::time::sleep(std::time::Duration::from_millis(50)).await;
            }
        }
    }
}

#[cfg(not(any(windows, unix)))]
async fn listen(_: &Path, _: String, _: Arc<dyn Host>, _: Arc<Limits>) -> std::io::Result<()> {
    Ok(())
}

fn serve_one<S>(stream: S, token: String, host: Arc<dyn Host>, limits: Arc<Limits>)
where
    S: tokio::io::AsyncRead + tokio::io::AsyncWrite + Send + Unpin + 'static,
{
    tauri::async_runtime::spawn(async move {
        match link::accept(stream, &token, host, |id| limits.for_id(id)).await {
            Ok(id) => tracing::info!(assistant = %id, "MCP: an assistant disconnected"),
            Err(why) => tracing::warn!(?why, "MCP: refused a connection"),
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn a_hook_tries_the_pipe_again_while_pluto_is_between_connections() {
        let tries = std::sync::atomic::AtomicU32::new(0);
        let got = open_with_retry(
            || {
                let n = tries.fetch_add(1, Ordering::SeqCst);
                async move {
                    if n < 2 {
                        Err(std::io::Error::from_raw_os_error(231))
                    } else {
                        Ok("pipe")
                    }
                }
            },
            5,
            std::time::Duration::from_millis(1),
        )
        .await;
        assert_eq!(got, Some("pipe"));
        assert_eq!(tries.load(Ordering::SeqCst), 3);
        // Pluto closed or no access: give up at once.
        tries.store(0, Ordering::SeqCst);
        let none: Option<&str> = open_with_retry(
            || {
                tries.fetch_add(1, Ordering::SeqCst);
                async { Err(std::io::Error::from(std::io::ErrorKind::PermissionDenied)) }
            },
            5,
            std::time::Duration::from_millis(1),
        )
        .await;
        assert_eq!(none, None);
        assert_eq!(tries.load(Ordering::SeqCst), 1);
        // Never more than the tries given.
        tries.store(0, Ordering::SeqCst);
        let _: Option<&str> = open_with_retry(
            || {
                tries.fetch_add(1, Ordering::SeqCst);
                async { Err(std::io::Error::from(std::io::ErrorKind::NotFound)) }
            },
            4,
            std::time::Duration::from_millis(1),
        )
        .await;
        assert_eq!(tries.load(Ordering::SeqCst), 4);
    }

    #[tokio::test]
    async fn the_pipe_opens_again_when_it_stops_instead_of_going_quiet_until_a_restart() {
        let runs = Arc::new(std::sync::atomic::AtomicU32::new(0));
        let r = runs.clone();
        keep_listening(
            move || {
                let n = r.fetch_add(1, Ordering::SeqCst);
                async move {
                    if n < 3 {
                        Err(std::io::Error::other("pipe broke"))
                    } else {
                        Ok(())
                    }
                }
            },
            std::time::Duration::from_millis(1),
        )
        .await;
        assert_eq!(runs.load(Ordering::SeqCst), 4);
    }

    fn args(list: &[&str]) -> Vec<String> {
        list.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn a_claude_code_hook_names_its_chat_and_a_permission_request_is_its_own_reaction() {
        let dir = tempfile::tempdir().unwrap();
        let t = dir.path().join("chat.jsonl");
        std::fs::write(
            &t,
            "{\"type\":\"user\",\"message\":{\"content\":\"Add Tab Tantrum\"}}\n",
        )
        .unwrap();
        let input = serde_json::json!({ "cwd": "E:\\Projects\\DESKTOP-PET", "transcript_path": t, "message": "Claude needs your permission to use Bash" }).to_string();
        assert_eq!(
            from_hook("agent_needs_you", &input),
            (
                "agent_permission",
                Some("to use Bash · DESKTOP-PET · “Add Tab Tantrum”".to_owned())
            )
        );
        // Codex's approval hook says the tool in a field and arrives as a permission already.
        let codex = serde_json::json!({ "cwd": "/w/app", "tool_name": "shell" }).to_string();
        assert_eq!(
            from_hook("agent_permission", &codex),
            ("agent_permission", Some("to use shell · app".to_owned()))
        );
        // A reply request, not a permission, names no tool.
        let reply =
            serde_json::json!({ "cwd": "/w/app", "message": "Claude is waiting for your input" })
                .to_string();
        assert_eq!(
            from_hook("agent_needs_you", &reply),
            ("agent_needs_you", Some("app".to_owned()))
        );
        let done =
            serde_json::json!({ "cwd": "/home/me/staysync", "transcript_path": "/missing.jsonl" })
                .to_string();
        assert_eq!(
            from_hook("agent_done", &done),
            ("agent_done", Some("staysync".to_owned()))
        );
        assert_eq!(from_hook("agent_done", "garbage"), ("agent_done", None));
    }

    #[test]
    fn an_away_bubble_has_no_assistant_prefix_or_action() {
        assert_eq!(
            bubble(PetMessage {
                assistant: String::new(),
                text: "Welcome back. Claude Code finished in DESKTOP-PET while you were away."
                    .into(),
                reaction: None,
            }),
            "Welcome back. Claude Code finished in DESKTOP-PET while you were away."
        );
    }

    #[test]
    fn a_click_finds_the_window_the_chats_hook_reported() {
        let list = WaitList::default();
        list.apply(
            WaitChange::Raise {
                assistant: "Claude Code".into(),
                place: Some("app".into()),
                kind: waiting::Kind::Needs,
                window: Some(77),
            },
            1_000,
        );
        assert_eq!(list.window_of("Claude Code", Some("app")), Some(77));
        assert_eq!(list.window_of("Claude Code", None), Some(77));
        assert_eq!(list.window_of("Codex", None), None);
        assert!(list.current(1_000)[0].jump);
    }

    #[test]
    fn the_wait_list_follows_hooks_and_drops_what_waited_too_long() {
        let list = WaitList::default();
        let raise = |assistant: &str, place: &str, kind| WaitChange::Raise {
            assistant: assistant.into(),
            place: Some(place.into()),
            kind,
            window: None,
        };
        let one = list.apply(
            raise("Claude Code", "app · “fix”", waiting::Kind::Needs),
            1_000,
        );
        assert_eq!(one.len(), 1);
        assert_eq!(
            (one[0].folder.as_str(), one[0].detail.as_str()),
            ("app", "“fix”")
        );
        // The same chat asks for a permission: still one chat, now naming the tool.
        let again = list.apply(
            raise(
                "Claude Code",
                "to use Bash · app",
                waiting::Kind::Permission,
            ),
            2_000,
        );
        assert_eq!(again.len(), 1);
        assert_eq!(
            (again[0].detail.as_str(), again[0].kind),
            ("to use Bash", waiting::Kind::Permission)
        );
        list.apply(raise("Claude Code", "site", waiting::Kind::Needs), 3_000);
        // A reply in "app" clears only app.
        let after = list.apply(
            WaitChange::Clear {
                assistant: "Claude Code".into(),
                place: Some("app · “fix”".into()),
            },
            4_000,
        );
        assert_eq!(
            after.iter().map(|c| c.folder.as_str()).collect::<Vec<_>>(),
            ["site"]
        );
        // Half an hour later it is gone without anyone saying so.
        assert!(list.current(3_000 + waiting::EXPIRES_MS).is_empty());
    }

    #[test]
    fn only_the_bridge_flag_runs_the_bridge_and_a_normal_start_opens_the_app() {
        assert_eq!(bridge_main(&args(&["pluto.exe"])), None);
        assert_eq!(bridge_main(&args(&["pluto.exe", "--hidden"])), None);
        assert_eq!(cli(&args(&["p", "--mcp-bridge"])), Some(Cli::Bridge));
        assert_eq!(
            cli(&args(&["p", "--react", "git_commit", "--assistant", "git"])),
            Some(Cli::React("git_commit".into()))
        );
    }

    #[test]
    fn the_assistant_id_comes_from_its_flag_and_bad_ids_fall_back() {
        assert_eq!(
            assistant_from(&args(&["p", "--mcp-bridge", "--assistant", "claude-code"])),
            "claude-code"
        );
        assert_eq!(assistant_from(&args(&["p", "--mcp-bridge"])), "assistant");
        assert_eq!(
            assistant_from(&args(&["p", "--assistant", "Bad Id"])),
            "assistant"
        );
    }

    #[test]
    fn a_store_install_of_the_claude_app_gets_pluto_in_the_file_it_really_reads() {
        let dir = tempfile::tempdir().unwrap();
        let (home, config, local) = (
            dir.path().join("home"),
            dir.path().join("config"),
            dir.path().join("local"),
        );
        let store = local.join("Packages/Claude_pzs8sxrjxfjjc/LocalCache/Roaming/Claude");
        std::fs::create_dir_all(&store).unwrap();
        std::fs::create_dir_all(local.join("Packages/Other_123")).unwrap();
        std::fs::create_dir_all(&home).unwrap();
        std::fs::write(
            store.join("claude_desktop_config.json"),
            r#"{"mcpServers":{},"preferences":{"sidebarMode":"epitaxy"}}"#,
        )
        .unwrap();
        let places = places_in("claude", &home, &config, Some(&local));
        assert_eq!(
            places.len(),
            3,
            "Claude Code, the usual folder, the Store folder"
        );
        let done = connect_places(&places, "C:\\Pluto\\pluto.exe").unwrap();
        assert_eq!(
            done,
            ["Claude app"],
            "only the installed Store folder is written"
        );
        let app: serde_json::Value = serde_json::from_str(
            &std::fs::read_to_string(store.join("claude_desktop_config.json")).unwrap(),
        )
        .unwrap();
        assert_eq!(app["mcpServers"]["pluto"]["args"][2], "claude-desktop");
        assert_eq!(
            app["preferences"]["sidebarMode"], "epitaxy",
            "settings kept"
        );
        assert!(
            !config.join("Claude").exists(),
            "no folder made for an app not there"
        );
    }

    #[test]
    fn one_claude_setup_covers_claude_code_and_the_claude_app_and_keeps_other_servers() {
        let dir = tempfile::tempdir().unwrap();
        let (home, config) = (dir.path().join("home"), dir.path().join("config"));
        std::fs::create_dir_all(config.join("Claude")).unwrap();
        std::fs::create_dir_all(&home).unwrap();
        std::fs::write(
            home.join(".claude.json"),
            r#"{"numStartups":3,"mcpServers":{"github":{"command":"gh"}}}"#,
        )
        .unwrap();
        let places = places_in("claude", &home, &config, None);
        let done = connect_places(&places, "C:\\Pluto\\pluto.exe").unwrap();
        assert_eq!(done, ["Claude Code", "Claude app"]);
        let code: serde_json::Value =
            serde_json::from_str(&std::fs::read_to_string(home.join(".claude.json")).unwrap())
                .unwrap();
        assert_eq!(code["numStartups"], 3);
        assert_eq!(code["mcpServers"]["github"]["command"], "gh");
        assert_eq!(code["mcpServers"]["pluto"]["args"][2], "claude-code");
        assert!(
            home.join(".claude.json.pluto-backup").is_file(),
            "the original is kept"
        );
        let app =
            std::fs::read_to_string(config.join("Claude/claude_desktop_config.json")).unwrap();
        assert!(app.contains("claude-desktop"));

        let info = describe("claude", "Claude", &places, "C:\\Pluto\\pluto.exe");
        assert!(info.installed && info.connected);

        disconnect_places(&places).unwrap();
        let code = std::fs::read_to_string(home.join(".claude.json")).unwrap();
        assert!(!code.contains("pluto\""), "Pluto is gone");
        assert!(code.contains("github"), "everything else stays");
        assert!(!describe("claude", "Claude", &places, "x").connected);
    }

    #[test]
    fn claude_code_hooks_go_in_with_connect_and_out_with_disconnect() {
        let dir = tempfile::tempdir().unwrap();
        assert_eq!(
            claude_hooks_file(dir.path()),
            None,
            "no Claude Code, no hooks"
        );
        std::fs::create_dir_all(dir.path().join(".claude")).unwrap();
        let file = claude_hooks_file(dir.path()).unwrap();
        add_claude_hooks(&file, "/opt/pluto").unwrap();
        assert!(setup::has_hooks(read_text(&file).as_deref()));
        remove_claude_hooks(&file).unwrap();
        assert!(!setup::has_hooks(read_text(&file).as_deref()));
        let lines = developer_lines("C:\\Pluto\\pluto.exe");
        assert!(lines
            .git_commit
            .contains("\"C:/Pluto/pluto.exe\" --react git_commit"));
        assert!(lines.build.contains("build_failed"));
    }

    #[test]
    fn codex_opencode_and_windsurf_connect_in_their_own_files_and_come_out_again() {
        let dir = tempfile::tempdir().unwrap();
        let home = dir.path().to_path_buf();
        let config = dir.path().join("AppData");
        // Nothing installed yet: not found.
        for id in ["codex", "opencode", "windsurf"] {
            assert!(
                !places_in(id, &home, &config, None)
                    .iter()
                    .any(Place::installed),
                "{id}"
            );
        }
        std::fs::create_dir_all(home.join(".codex")).unwrap();
        std::fs::write(home.join(".codex").join("config.toml"), "model = \"o3\"\n").unwrap();
        std::fs::create_dir_all(home.join(".config").join("opencode")).unwrap();
        std::fs::create_dir_all(home.join(".codeium").join("windsurf")).unwrap();

        let program = "/opt/pluto";
        for id in ["codex", "opencode", "windsurf"] {
            let places = places_in(id, &home, &config, None);
            let done = connect_places(&places, program).unwrap();
            assert!(!done.is_empty(), "{id}");
            assert!(describe(id, id, &places, program).connected, "{id}");
        }
        let codex = std::fs::read_to_string(home.join(".codex").join("config.toml")).unwrap();
        assert!(
            codex.contains("model = \"o3\"")
                && codex.contains("[mcp_servers.pluto]")
                && codex.contains("notify = ")
        );
        let opencode: serde_json::Value = serde_json::from_str(
            &std::fs::read_to_string(home.join(".config").join("opencode").join("opencode.json"))
                .unwrap(),
        )
        .unwrap();
        assert_eq!(opencode["mcp"]["pluto"]["command"][0], program);
        // Windsurf's editor file is written; the Devin one only where its folder exists.
        assert!(home
            .join(".codeium")
            .join("windsurf")
            .join("mcp_config.json")
            .is_file());

        for id in ["codex", "opencode", "windsurf"] {
            disconnect_places(&places_in(id, &home, &config, None)).unwrap();
            assert!(
                !describe(id, id, &places_in(id, &home, &config, None), program).connected,
                "{id}"
            );
        }
        assert_eq!(
            std::fs::read_to_string(home.join(".codex").join("config.toml"))
                .unwrap()
                .trim(),
            "model = \"o3\""
        );
    }

    #[test]
    fn cursor_hooks_and_the_opencode_plugin_go_in_and_out_and_never_overwrite_a_foreign_file() {
        let dir = tempfile::tempdir().unwrap();
        let home = dir.path();
        assert_eq!(cursor_hooks_file(home), None);
        assert_eq!(opencode_plugin_file(home), None);
        std::fs::create_dir_all(home.join(".cursor")).unwrap();
        let hooks = cursor_hooks_file(home).unwrap();
        add_cursor_hooks(&hooks, "/opt/pluto").unwrap();
        assert!(read_text(&hooks)
            .unwrap()
            .contains("--react agent_done --assistant cursor"));
        remove_cursor_hooks(&hooks).unwrap();
        assert!(!read_text(&hooks).unwrap().contains("--react"));

        std::fs::create_dir_all(home.join(".config").join("opencode")).unwrap();
        let plugin = opencode_plugin_file(home).unwrap();
        add_opencode_plugin(&plugin, "/opt/pluto").unwrap();
        assert!(read_text(&plugin).unwrap().contains("session.idle"));
        add_opencode_plugin(&plugin, "/opt/pluto2").unwrap();
        assert!(read_text(&plugin).unwrap().contains("/opt/pluto2"));
        remove_opencode_plugin(&plugin).unwrap();
        assert!(!plugin.exists());
        // Somebody else's file with the same name stays as it is.
        std::fs::write(&plugin, "export const Mine = async () => ({})\n").unwrap();
        assert!(add_opencode_plugin(&plugin, "/opt/pluto").is_err());
        remove_opencode_plugin(&plugin).unwrap();
        assert_eq!(
            read_text(&plugin).unwrap(),
            "export const Mine = async () => ({})\n"
        );
    }

    #[test]
    fn a_done_that_ends_with_a_question_becomes_needs_you_for_any_tool() {
        // Codex hands its last message over directly.
        let codex = r#"{"type":"agent-turn-complete","cwd":"/work/app","last-assistant-message":"Pushed. Want a PR too?"}"#;
        assert_eq!(from_hook("agent_done", codex).0, "agent_needs_you");
        let plain = r#"{"cwd":"/work/app","last-assistant-message":"All done."}"#;
        assert_eq!(from_hook("agent_done", plain).0, "agent_done");
        // A tool that only names a transcript (Cursor, Claude Code): the end of it is read.
        let dir = tempfile::tempdir().unwrap();
        let t = dir.path().join("t.jsonl");
        let mut body = String::new();
        for i in 0..4000 {
            body.push_str(&format!(r#"{{"role":"user","content":"filler line number {i} to push the file past the tail size"}}"#));
            body.push('\n');
        }
        body.push_str(
            r#"{"role":"assistant","content":[{"type":"text","text":"Which one should I use?"}]}"#,
        );
        std::fs::write(&t, &body).unwrap();
        assert!(
            body.len() > 128 * 1024,
            "the file is longer than the tail that is read"
        );
        let input = serde_json::json!({ "cwd": "/work/app", "transcript_path": t }).to_string();
        assert_eq!(from_hook("agent_done", &input).0, "agent_needs_you");
        // Only a "done" is ever changed.
        assert_eq!(from_hook("git_push", codex).0, "git_push");
        assert_eq!(from_hook("agent_needs_you", plain).0, "agent_needs_you");
    }

    #[test]
    fn codex_gets_its_approval_hook_with_connect_and_loses_it_with_disconnect() {
        let dir = tempfile::tempdir().unwrap();
        // CODEX_HOME may point elsewhere on the test machine; only the shape is checked here.
        let file = dir.path().join("hooks.json");
        add_codex_hooks(&file, "/opt/pluto").unwrap();
        assert!(setup::has_codex_hooks(read_text(&file).as_deref()));
        remove_codex_hooks(&file).unwrap();
        assert!(!setup::has_codex_hooks(read_text(&file).as_deref()));
        let lines = developer_lines("C:\\Pluto\\pluto.exe");
        assert!(lines
            .agent_permission
            .contains("--react agent_permission --assistant my-app"));
        assert!(lines.agent_needs_you.contains("C:/Pluto/pluto.exe"));
        assert!(lines.agent_done.ends_with("--assistant my-app"));
    }

    #[test]
    fn codex_and_opencode_say_where_a_reaction_came_from() {
        let json = r#"{"type":"agent-turn-complete","cwd":"/work/pluto","input-messages":["Fix the tray"]}"#;
        let args: Vec<String> = [
            "pluto",
            "--react",
            "agent_done",
            "--assistant",
            "codex",
            json,
        ]
        .map(String::from)
        .to_vec();
        assert_eq!(react_extra(&args, None).as_deref(), Some(json));
        let (reaction, place) = from_hook("agent_done", &react_extra(&args, None).unwrap());
        assert_eq!(reaction, "agent_done");
        assert_eq!(place.as_deref(), Some("pluto · “Fix the tray”"));
        // OpenCode: the folder comes in the environment, with the folder name only.
        let plain: Vec<String> = ["pluto", "--react", "agent_done", "--assistant", "opencode"]
            .map(String::from)
            .to_vec();
        let from_env = react_extra(&plain, Some("/home/me/site".into())).unwrap();
        assert_eq!(
            from_hook("agent_done", &from_env).1.as_deref(),
            Some("site")
        );
        assert_eq!(react_extra(&plain, None), None);
        assert_eq!(react_extra(&plain, Some("  ".into())), None);
    }

    #[test]
    fn an_assistant_that_is_not_installed_is_left_alone() {
        let dir = tempfile::tempdir().unwrap();
        let places = places_in("cursor", dir.path(), dir.path(), None);
        assert!(connect_places(&places, "pluto").unwrap().is_empty());
        assert!(!dir.path().join(".cursor").exists());
        let info = describe("cursor", "Cursor", &places, "pluto");
        assert!(!info.installed && !info.connected);
        assert!(info.places[0].manual.contains("--mcp-bridge"));
    }

    #[tokio::test]
    async fn a_question_gets_the_button_pressed_once_and_a_late_press_is_ignored() {
        let asks = Asks::default();
        let (id, answer) = asks.open();
        assert!(asks.answer(id, "Allow".into()));
        assert_eq!(answer.await.unwrap(), "Allow");
        assert!(!asks.answer(id, "Deny".into()), "already answered");
        let (late, _gone) = asks.open();
        asks.forget(late);
        assert!(!asks.answer(late, "Allow".into()), "timed out");
    }

    #[test]
    fn stopping_removes_the_token_so_no_bridge_can_get_in() {
        let dir = tempfile::tempdir().unwrap();
        write_token(dir.path(), "abc").unwrap();
        let mcp = Mcp::default();
        assert!(!mcp.listening());
        mcp.stop(dir.path());
        assert!(!dir.path().join(TOKEN_FILE).exists());
    }

    #[test]
    fn the_token_file_is_written_for_this_run_and_forgotten_after() {
        let dir = tempfile::tempdir().unwrap();
        write_token(dir.path(), "abc").unwrap();
        assert_eq!(
            std::fs::read_to_string(dir.path().join(TOKEN_FILE)).unwrap(),
            "abc"
        );
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mode = std::fs::metadata(dir.path().join(TOKEN_FILE))
                .unwrap()
                .permissions()
                .mode();
            assert_eq!(mode & 0o777, 0o600, "only this user can read it");
        }
        forget(dir.path());
        assert!(!dir.path().join(TOKEN_FILE).exists());
    }

    /// The real socket on Linux and macOS CI: Pluto listening, a bridge with the token reaching
    /// the pet, and one without being refused.
    #[cfg(unix)]
    #[tokio::test]
    async fn over_the_real_socket_only_a_bridge_with_this_runs_token_gets_in() {
        use std::sync::Mutex as StdMutex;
        #[derive(Default)]
        struct Seen(StdMutex<Vec<String>>);
        impl Host for Seen {
            fn status(&self) -> HostFuture<'_, Status> {
                Box::pin(async { Status::default() })
            }
            fn show(&self, m: PetMessage) {
                self.0.lock().unwrap().push(m.text);
            }
        }
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(SOCKET_FILE);
        let listener = tokio::net::UnixListener::bind(&path).unwrap();
        let seen = Arc::new(Seen::default());
        let host: Arc<dyn Host> = seen.clone();
        tokio::spawn(async move {
            for _ in 0..2 {
                let (s, _) = listener.accept().await.unwrap();
                let h = host.clone();
                tokio::spawn(async move {
                    link::accept(s, "tok", h, |_| Arc::new(RateLimit::default())).await
                });
            }
        });
        // A bridge with the wrong token is closed before anything reaches the pet.
        let mut wrong = tokio::net::UnixStream::connect(&path).await.unwrap();
        use tokio::io::{AsyncReadExt, AsyncWriteExt};
        wrong
            .write_all(link::hello_line("nope", "cursor").as_bytes())
            .await
            .unwrap();
        let mut buf = [0u8; 1];
        assert_eq!(wrong.read(&mut buf).await.unwrap(), 0, "closed");
        // The real one gets through, raw MCP after the first line.
        let mut right = tokio::net::UnixStream::connect(&path).await.unwrap();
        right
            .write_all(link::hello_line("tok", "cursor").as_bytes())
            .await
            .unwrap();
        let client = rmcp::ServiceExt::serve((), right).await.unwrap();
        let mut p = rmcp::model::CallToolRequestParams::new("react");
        p = p.with_arguments(
            serde_json::json!({ "reaction": "build_ok" })
                .as_object()
                .unwrap()
                .clone(),
        );
        client.call_tool(p).await.unwrap();
        assert_eq!(
            seen.0.lock().unwrap().clone(),
            vec!["Build passed".to_string()]
        );
        client.cancel().await.unwrap();
    }
}
