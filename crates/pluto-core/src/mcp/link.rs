//! The private link between the bridge (`Pluto --mcp-bridge`, started by an assistant) and the
//! running Pluto (`MCP_PLAN.md` §3.2). Platform-neutral: the shell supplies the stream (a named
//! pipe on Windows, a Unix socket on macOS) and the token file.
//!
//! The bridge's first line is `PLUTO1 <token> <assistant id>\n`; after it, the stream carries
//! plain MCP. A wrong token, an unknown form or a line that never ends closes the connection.

use std::sync::Arc;
use std::time::Duration;

use tokio::io::{AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt};

use super::{Host, PlutoMcp, RateLimit};

const HELLO: &str = "PLUTO1";
/// The longest first line accepted.
const HELLO_MAX: usize = 256;
/// How long a new connection may take to introduce itself.
pub const HELLO_TIMEOUT: Duration = Duration::from_secs(5);
/// The longest assistant id.
pub const ID_MAX: usize = 40;

/// A fresh per-run token: 244 random bits as 64 hex characters.
pub fn new_token() -> String {
    format!(
        "{}{}",
        uuid::Uuid::new_v4().simple(),
        uuid::Uuid::new_v4().simple()
    )
}

/// The first line the bridge sends.
pub fn hello_line(token: &str, assistant: &str) -> String {
    format!("{HELLO} {token} {assistant}\n")
}

/// The one line a hook, a git hook or a build sends to play one reaction and close (developer
/// reactions, P4.2/P4.3): `PLUTO1R <token> <id> <reaction> [place]`, where the optional place
/// (which chat or project, percent-encoded) is shown after the line.
pub const REACT_HELLO: &str = "PLUTO1R";

pub fn react_line(token: &str, assistant: &str, reaction: &str, place: Option<&str>) -> String {
    react_line_at(token, assistant, reaction, place, None)
}

/// The same line with the window the chat runs in (A-4): a last word `w=<number>`, which an
/// encoded place can never be (its `=` would be `%3D`). The number is the platform's handle
/// (Windows: the top-level window; macOS: the app's process id); Pluto only hands it back to the OS.
pub fn react_line_at(
    token: &str,
    assistant: &str,
    reaction: &str,
    place: Option<&str>,
    window: Option<i64>,
) -> String {
    let mut line = format!("{REACT_HELLO} {token} {assistant} {reaction}");
    if let Some(p) = place.and_then(super::hookctx::clean_place) {
        line.push(' ');
        line.push_str(&super::hookctx::encode(&p));
    }
    if let Some(w) = window {
        line.push_str(&format!(" w={w}"));
    }
    line.push('\n');
    line
}

/// A checked reaction line: the assistant id, the reaction, and where (if given).
pub type ReactLine = (String, &'static str, Option<String>);

/// Checks a reaction line: the token, the id, and a reaction Pluto knows.
pub fn check_react(line: &str, token: &str) -> Result<ReactLine, Refused> {
    check_react_at(line, token).map(|(r, _)| r)
}

/// [`check_react`], also giving the chat's window when the line names one (A-4).
pub fn check_react_at(line: &str, token: &str) -> Result<(ReactLine, Option<i64>), Refused> {
    let mut parts = line.trim_end_matches(['\r', '\n']).split(' ');
    let (Some(REACT_HELLO), Some(given), Some(id), Some(name)) =
        (parts.next(), parts.next(), parts.next(), parts.next())
    else {
        return Err(Refused::BadHello);
    };
    let mut place = None;
    let mut window = None;
    for word in parts {
        if let Some(n) = word.strip_prefix("w=") {
            if window.is_some() {
                return Err(Refused::BadHello);
            }
            window = Some(n.parse::<i64>().map_err(|_| Refused::BadHello)?);
        } else if place.is_none() && window.is_none() {
            place = Some(
                super::hookctx::decode(word)
                    .and_then(|p| super::hookctx::clean_place(&p))
                    .ok_or(Refused::BadHello)?,
            );
        } else {
            return Err(Refused::BadHello);
        }
    }
    if !same(given.as_bytes(), token.as_bytes()) {
        return Err(Refused::WrongToken);
    }
    let known = super::REACTIONS
        .iter()
        .find(|(n, _)| *n == name)
        .map(|(n, _)| *n);
    match known {
        Some(reaction) if id_is_valid(id) => Ok(((id.to_owned(), reaction, place), window)),
        _ => Err(Refused::BadHello),
    }
}

/// Whether `id` is a valid assistant id: lowercase letters, digits and `-`, 1 to 40 long.
pub fn id_is_valid(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= ID_MAX
        && id
            .bytes()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
}

/// The name shown on the pet for an assistant id: known assistants by name, others with their
/// words capitalised (`my-agent` → "My Agent").
pub fn display_name(id: &str) -> String {
    match id {
        "claude-code" => "Claude Code".into(),
        "claude-desktop" | "claude" => "Claude".into(),
        "chatgpt" => "ChatGPT".into(),
        "opencode" => "OpenCode".into(),
        "vscode" | "copilot" => "VS Code".into(),
        _ => id
            .split('-')
            .filter(|w| !w.is_empty())
            .map(|w| {
                let mut c = w.chars();
                c.next()
                    .map(|f| f.to_uppercase().chain(c).collect::<String>())
                    .unwrap_or_default()
            })
            .collect::<Vec<_>>()
            .join(" "),
    }
}

/// Why a connection was refused (for the request log; the other side only sees it close).
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Refused {
    /// No complete first line in time, or it was too long.
    NoHello,
    /// Not the `PLUTO1 <token> <id>` form, or a bad id.
    BadHello,
    /// The token is not this run's.
    WrongToken,
}

/// Checks the first line against this run's token and returns the assistant id.
pub fn check_hello(line: &str, token: &str) -> Result<String, Refused> {
    let mut parts = line.trim_end_matches(['\r', '\n']).split(' ');
    let (Some(HELLO), Some(given), Some(id), None) =
        (parts.next(), parts.next(), parts.next(), parts.next())
    else {
        return Err(Refused::BadHello);
    };
    if !same(given.as_bytes(), token.as_bytes()) {
        return Err(Refused::WrongToken);
    }
    if !id_is_valid(id) {
        return Err(Refused::BadHello);
    }
    Ok(id.to_owned())
}

/// Compares in time that does not depend on where the first difference is.
fn same(a: &[u8], b: &[u8]) -> bool {
    a.len() == b.len() && a.iter().zip(b).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

/// Reads the first line one byte at a time, so nothing after it is taken from the stream.
async fn read_hello<S: AsyncRead + Unpin>(stream: &mut S) -> Result<String, Refused> {
    let mut line = Vec::with_capacity(96);
    loop {
        let mut byte = [0u8; 1];
        match stream.read(&mut byte).await {
            Ok(1) if byte[0] == b'\n' => break,
            Ok(1) if line.len() < HELLO_MAX => line.push(byte[0]),
            _ => return Err(Refused::NoHello),
        }
    }
    String::from_utf8(line).map_err(|_| Refused::BadHello)
}

/// Serves one connection from a bridge: checks its first line, then runs the MCP server for that
/// assistant until the bridge closes. `limit_for` gives each assistant its shared rate limit.
pub async fn accept<S>(
    mut stream: S,
    token: &str,
    host: Arc<dyn Host>,
    limit_for: impl Fn(&str) -> Arc<RateLimit>,
) -> Result<String, Refused>
where
    S: AsyncRead + AsyncWrite + Send + Unpin + 'static,
{
    let line = tokio::time::timeout(HELLO_TIMEOUT, read_hello(&mut stream))
        .await
        .map_err(|_| Refused::NoHello)??;
    if line.starts_with(REACT_HELLO) {
        let ((id, reaction, place), window) = check_react_at(&line, token)?;
        let server = PlutoMcp::new(host, &display_name(&id), limit_for(&id));
        let said = server.react_once_at(reaction, place.as_deref(), window);
        let _ = stream.write_all(format!("{said}\n").as_bytes()).await;
        let _ = stream.shutdown().await;
        return Ok(id);
    }
    let id = check_hello(&line, token)?;
    let server = PlutoMcp::new(host, &display_name(&id), limit_for(&id));
    // A protocol error or a closed pipe ends this connection only.
    let _ = server.serve(stream).await;
    Ok(id)
}

/// Plays one reaction on a running Pluto (`Pluto --react`): sends the line and waits briefly
/// for the answer. Returns what Pluto said, or `None` when it did not answer.
pub async fn send_reaction<P>(
    pipe: P,
    token: &str,
    assistant: &str,
    reaction: &str,
    place: Option<&str>,
) -> Option<String>
where
    P: AsyncRead + AsyncWrite + Unpin,
{
    send_reaction_at(pipe, token, assistant, reaction, place, None).await
}

/// [`send_reaction`], also telling Pluto which window the chat runs in (A-4).
pub async fn send_reaction_at<P>(
    mut pipe: P,
    token: &str,
    assistant: &str,
    reaction: &str,
    place: Option<&str>,
    window: Option<i64>,
) -> Option<String>
where
    P: AsyncRead + AsyncWrite + Unpin,
{
    pipe.write_all(react_line_at(token, assistant, reaction, place, window).as_bytes())
        .await
        .ok()?;
    let mut answer = String::new();
    tokio::time::timeout(HELLO_TIMEOUT, pipe.read_to_string(&mut answer))
        .await
        .ok()?
        .ok()?;
    Some(answer.trim().to_owned())
}

/// The bridge side: introduces itself on `pipe` and then copies bytes both ways between the
/// assistant (`stdio`) and Pluto until either side closes. With no `pipe` (Pluto is not
/// running, or MCP is off), it serves the offline tools on `stdio` instead.
pub async fn bridge<P, S>(
    pipe: Option<P>,
    token: &str,
    assistant: &str,
    mut stdio: S,
) -> std::io::Result<()>
where
    P: AsyncRead + AsyncWrite + Send + Unpin + 'static,
    S: AsyncRead + AsyncWrite + Send + Unpin + 'static,
{
    match pipe {
        Some(mut pipe) => {
            pipe.write_all(hello_line(token, assistant).as_bytes())
                .await?;
            tokio::io::copy_bidirectional(&mut stdio, &mut pipe).await?;
            Ok(())
        }
        None => PlutoMcp::offline(&display_name(assistant))
            .serve(stdio)
            .await
            .map_err(std::io::Error::other),
    }
}
