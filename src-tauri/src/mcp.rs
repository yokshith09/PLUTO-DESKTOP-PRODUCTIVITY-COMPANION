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
use pluto_core::mcp::activity::{Activity, Call};
use pluto_core::mcp::link;
use pluto_core::mcp::setup::{self, Format};
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

/// Run as the bridge if `args` ask for it; returns the exit code, or `None` to start the app.
/// Called first thing in `main`.
pub fn bridge_main(args: &[String]) -> Option<i32> {
    if !args.iter().any(|a| a == BRIDGE_FLAG) {
        return None;
    }
    let assistant = assistant_from(args);
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .ok()?;
    let ok = runtime.block_on(async move {
        let token = data_dir()
            .and_then(|d| std::fs::read_to_string(d.join(TOKEN_FILE)).ok())
            .map(|t| t.trim().to_owned())
            .unwrap_or_default();
        let stdio = tokio::io::join(tokio::io::stdin(), tokio::io::stdout());
        let pipe = if token.is_empty() {
            None
        } else {
            connect().await
        };
        link::bridge(pipe, &token, &assistant, stdio).await.is_ok()
    });
    Some(if ok { 0 } else { 1 })
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
        let text = if message.reaction.is_some() {
            message.text
        } else {
            format!("{}: {}", message.assistant, message.text)
        };
        let _ = self
            .app
            .emit("pet://say", serde_json::json!({ "text": text }));
    }

    fn data(&self) -> Option<pluto_core::mcp::read::Data> {
        let core = self.app.try_state::<crate::Core>()?;
        Some(pluto_core::mcp::read::Data {
            db: core.db.clone(),
            clock: core.clock.clone(),
        })
    }

    fn record(&self, tool: &'static str, assistant: &str, ok: bool, detail: String) {
        let at_ms = self
            .app
            .try_state::<crate::Core>()
            .map(|core| core.clock.now_ms())
            .unwrap_or_default();
        self.activity.record(Call {
            at_ms,
            assistant: assistant.to_owned(),
            tool: tool.to_owned(),
            ok,
            detail,
            changed: false,
        });
        let _ = self.app.emit("mcp://activity", ());
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

fn enabled(all: &std::collections::BTreeMap<String, serde_json::Value>) -> bool {
    all.get("mcp.enabled").and_then(serde_json::Value::as_bool) == Some(true)
}

/// Follows `mcp.enabled`: listens while it is on, stops and removes the token when it goes off.
/// Expects [`Mcp`] in the app's state.
pub fn start(app: AppHandle, settings: Arc<SettingsService>, bus: &EventBus, data_dir: PathBuf) {
    let mut events = bus.subscribe();
    tauri::async_runtime::spawn(async move {
        let mcp = app.state::<Mcp>();
        forget(&data_dir);
        let mut on = false;
        loop {
            let want = enabled(&settings.get_all().await.unwrap_or_default());
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
                Recv::Event(Event::SettingChanged { key, .. }) if key == "mcp.enabled" => {}
                Recv::Event(Event::AllDataDeleted { .. }) | Recv::Resync { .. } => {}
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
fn places_in(id: &str, home: &Path, config: &Path) -> Vec<Place> {
    match id {
        // One setup for both: Claude Code and the Claude app.
        "claude" => vec![
            Place {
                label: "Claude Code",
                path: home.join(".claude.json"),
                format: Format::McpServers,
                id: "claude-code",
                needs_file: true,
            },
            Place {
                label: "Claude app",
                path: config.join("Claude").join("claude_desktop_config.json"),
                format: Format::McpServers,
                id: "claude-desktop",
                needs_file: false,
            },
        ],
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
        .map(|(home, config)| places_in(id, &home, &config))
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
    let done = connect_places(&places, &this_program())?;
    settings
        .set("mcp.enabled", serde_json::Value::Bool(true))
        .await
        .map_err(|e| e.message)?;
    Ok(done.into_iter().map(String::from).collect())
}

/// Takes Pluto out of the assistant's settings.
#[tauri::command]
pub fn mcp_disconnect(id: String) -> Result<(), String> {
    disconnect_places(&places(&id))
}

/// True while Pluto is listening for assistants.
#[tauri::command]
pub fn mcp_listening(mcp: State<'_, Mcp>) -> bool {
    mcp.listening()
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
    fn only_the_bridge_flag_runs_the_bridge_and_a_normal_start_opens_the_app() {
        assert_eq!(bridge_main(&args(&["pluto.exe"])), None);
        assert_eq!(bridge_main(&args(&["pluto.exe", "--hidden"])), None);
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
        let places = places_in("claude", &home, &config);
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
    fn an_assistant_that_is_not_installed_is_left_alone() {
        let dir = tempfile::tempdir().unwrap();
        let places = places_in("cursor", dir.path(), dir.path());
        assert!(connect_places(&places, "pluto").unwrap().is_empty());
        assert!(!dir.path().join(".cursor").exists());
        let info = describe("cursor", "Cursor", &places, "pluto");
        assert!(!info.installed && !info.connected);
        assert!(info.places[0].manual.contains("--mcp-bridge"));
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
