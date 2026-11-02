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

/// What the Assistants page shows about the connection.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Setup {
    /// True while Pluto is listening for assistants.
    pub listening: bool,
    /// The program an assistant starts (this Pluto).
    pub command: String,
    /// The JSON to paste into an assistant's MCP settings.
    pub config: String,
}

/// The JSON block most assistants accept (`mcpServers`), for the assistant id given.
pub fn config_json(command: &str, assistant: &str) -> String {
    let value = serde_json::json!({
        "mcpServers": {
            "pluto": {
                "command": command,
                "args": [BRIDGE_FLAG, "--assistant", assistant],
            }
        }
    });
    serde_json::to_string_pretty(&value).unwrap_or_default()
}

#[tauri::command]
pub fn mcp_setup(mcp: State<'_, Mcp>, assistant: Option<String>) -> Setup {
    let assistant = assistant
        .filter(|id| link::id_is_valid(id))
        .unwrap_or_else(|| "assistant".into());
    let command = std::env::current_exe()
        .map(|p| p.to_string_lossy().into_owned())
        .unwrap_or_else(|_| "Pluto".into());
    Setup {
        listening: mcp.listening(),
        config: config_json(&command, &assistant),
        command,
    }
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
    fn the_setup_to_copy_starts_this_pluto_as_the_bridge_for_the_chosen_assistant() {
        let json: serde_json::Value =
            serde_json::from_str(&config_json(r"C:\Pluto\pluto.exe", "claude-code")).unwrap();
        let pluto = &json["mcpServers"]["pluto"];
        assert_eq!(pluto["command"], r"C:\Pluto\pluto.exe");
        assert_eq!(
            pluto["args"],
            serde_json::json!(["--mcp-bridge", "--assistant", "claude-code"])
        );
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
