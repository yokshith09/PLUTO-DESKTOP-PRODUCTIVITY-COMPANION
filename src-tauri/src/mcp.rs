//! MCP in the shell (`MCP_PLAN.md` §3): the private pipe the running Pluto listens on, the
//! per-run token file, the [`Host`] that makes the real pet speak, and `--mcp-bridge`, which an
//! assistant starts and which runs before any window, tray or single-instance rule.
//!
//! Step P4.1a. Listening only while `mcp.enabled` is on at start-up (off by default); the MCP page
//! with the switch and the assistant list comes next.

use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, PoisonError};

use pluto_core::mcp::link;
use pluto_core::mcp::{Host, HostFuture, PetMessage, RateLimit, Status};
use tauri::{AppHandle, Emitter, Runtime};

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
}

impl<R: Runtime> Host for ShellHost<R> {
    fn status(&self) -> HostFuture<'_, Status> {
        // Focus, the app in front and today's counts are filled in with the read tools (P4.1b).
        Box::pin(async { Status::default() })
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

/// Starts listening for bridges if `mcp.enabled` is on; otherwise removes any old token.
pub fn start<R: Runtime>(app: AppHandle<R>, data_dir: PathBuf, enabled: bool) {
    forget(&data_dir);
    if !enabled {
        return;
    }
    let token = link::new_token();
    if let Err(e) = write_token(&data_dir, &token) {
        tracing::warn!(error = %e, "MCP: could not write the token; assistants cannot connect");
        return;
    }
    let host: Arc<dyn Host> = Arc::new(ShellHost { app });
    let limits = Arc::new(Limits::default());
    tauri::async_runtime::spawn(async move {
        if let Err(e) = listen(&data_dir, token, host, limits).await {
            tracing::warn!(error = %e, "MCP: the private pipe stopped");
        }
    });
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
