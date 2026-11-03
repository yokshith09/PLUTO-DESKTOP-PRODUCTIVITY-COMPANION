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
use pluto_core::mcp::{hookctx, link};
use pluto_core::mcp::{Host, HostFuture, PetMessage, RateLimit, Status};
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
async fn react_now(assistant: &str, reaction: &str) {
    let token = token_now();
    if token.is_empty() {
        return;
    }
    // A Claude Code hook pipes its chat's details in: say which chat (folder, first request)
    // and whether it is asking for permission (owner 2026-11-03).
    let (reaction, place) = match hook_input() {
        Some(input) => from_hook(reaction, &input),
        None => (reaction, None),
    };
    if let Some(pipe) = connect().await {
        let _ = link::send_reaction(pipe, &token, assistant, reaction, place.as_deref()).await;
    }
}

/// The reaction and the chat it is about, from a Claude Code hook's input: a "needs you" that asks
/// for a permission becomes `agent_permission`; the place is the folder and the first request.
fn from_hook<'a>(reaction: &'a str, input: &str) -> (&'a str, Option<String>) {
    let ctx = hookctx::parse(input);
    let request = ctx
        .transcript
        .as_deref()
        .and_then(transcript_head)
        .and_then(|t| hookctx::first_request(&t));
    let reaction = if ctx.permission && reaction == "agent_needs_you" {
        "agent_permission"
    } else {
        reaction
    };
    (reaction, hookctx::place(&ctx, request.as_deref()))
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
                react_now(&assistant, &reaction).await;
                0
            }
        }
    }))
}

#[cfg(windows)]
async fn connect() -> Option<tokio::net::windows::named_pipe::NamedPipeClient> {
    tokio::net::windows::named_pipe::ClientOptions::new()
        .open(pipe_name())
        .ok()
}

#[cfg(unix)]
async fn connect() -> Option<tokio::net::UnixStream> {
    tokio::net::UnixStream::connect(data_dir()?.join(SOCKET_FILE))
        .await
        .ok()
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
    if message.reaction.is_some() {
        message.text
    } else {
        format!("{}: {}", message.assistant, message.text)
    }
}

fn show_on_pet<R: Runtime>(app: &AppHandle<R>, message: PetMessage) {
    let _ = app.emit("pet://say", serde_json::json!({ "text": bubble(message) }));
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
        show_on_pet(&self.app, message);
    }

    fn hold(&self, message: &PetMessage) -> bool {
        self.guard.hold(message)
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
    });
    let limits = Arc::new(Limits::default());
    let dir = data_dir.to_owned();
    let task = tauri::async_runtime::spawn(async move {
        if let Err(e) = listen(&dir, token, host, limits).await {
            tracing::warn!(error = %e, "MCP: the private pipe stopped");
        }
    });
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
                        show_on_pet(&app, last);
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
    ("vscode", "VS Code"),
    ("cursor", "Cursor"),
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
        _ => Vec::new(),
    }
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
}

pub fn developer_lines(program: &str) -> DeveloperLines {
    let p = program.replace('\\', "/");
    DeveloperLines {
        git_commit: format!("#!/bin/sh\n\"{p}\" --react git_commit --assistant git\n"),
        git_push: format!("#!/bin/sh\n\"{p}\" --react git_push --assistant git\n"),
        build: format!("<your build> && \"{p}\" --react build_ok --assistant build || \"{p}\" --react build_failed --assistant build"),
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
        server.connect().await?;
        let client = server;
        server = ServerOptions::new()
            .reject_remote_clients(true)
            .create(&name)?;
        serve_one(client, token.clone(), host.clone(), limits.clone());
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
        let (stream, _) = listener.accept().await?;
        serve_one(stream, token.clone(), host.clone(), limits.clone());
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
                Some("DESKTOP-PET · “Add Tab Tantrum”".to_owned())
            )
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
