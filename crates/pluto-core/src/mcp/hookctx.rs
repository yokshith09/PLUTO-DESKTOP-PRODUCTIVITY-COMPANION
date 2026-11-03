//! Which chat a Claude Code hook is about (owner 2026-11-03: "my pet says Claude Code is done,
//! but I don't know which chat; I use 3 chats, mention the folder"). Claude Code hands each hook
//! a JSON object on stdin with the chat's working folder (`cwd`), its transcript path, and for a
//! Notification the message ("Claude needs your permission to use Bash", "Claude is waiting for
//! your input"). From that the pet line names the folder and the chat's first request, and tells
//! a permission request apart from a plain "needs you".

use std::path::PathBuf;

use serde_json::Value;

/// What a hook's input says about its chat.
#[derive(Debug, Default, PartialEq, Eq)]
pub struct HookInput {
    /// The last part of the chat's folder ("DESKTOP-PET").
    pub folder: Option<String>,
    pub transcript: Option<PathBuf>,
    /// The Notification asks for a permission (rather than for a reply).
    pub permission: bool,
    /// The request itself, when the tool says it (Codex's `input-messages`), shortened.
    pub request: Option<String>,
}

/// Reads a hook's stdin JSON; anything unreadable gives an empty context.
pub fn parse(input: &str) -> HookInput {
    let Ok(v) = serde_json::from_str::<Value>(input) else {
        return HookInput::default();
    };
    let s = |k: &str| {
        v.get(k)
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|x| !x.is_empty())
    };
    // Claude Code and Codex say `cwd`; Cursor lists `workspace_roots`.
    let root = v
        .get("workspace_roots")
        .and_then(Value::as_array)
        .and_then(|r| r.first())
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|x| !x.is_empty());
    let folder = s("cwd").or(root).and_then(|c| {
        c.trim_end_matches(['/', '\\'])
            .rsplit(['/', '\\'])
            .next()
            .filter(|n| !n.is_empty())
            .map(str::to_owned)
    });
    HookInput {
        folder,
        transcript: s("transcript_path").map(PathBuf::from),
        permission: s("message").is_some_and(|m| m.to_lowercase().contains("permission")),
        request: v
            .get("input-messages")
            .and_then(Value::as_array)
            .and_then(|m| {
                m.iter()
                    .filter_map(Value::as_str)
                    .find(|t| !t.trim().is_empty())
            })
            .map(shorten),
    }
}

/// How much of the first request is shown.
const TOPIC_CHARS: usize = 32;

/// The chat's first request you typed, shortened: the first `user` line of the transcript whose
/// text is yours (not a command or a tool result).
pub fn first_request(transcript_jsonl: &str) -> Option<String> {
    for line in transcript_jsonl.lines().take(400) {
        let Ok(v) = serde_json::from_str::<Value>(line) else {
            continue;
        };
        if v.get("type").and_then(Value::as_str) != Some("user") {
            continue;
        }
        let content = v.get("message").and_then(|m| m.get("content"));
        let text = match content {
            Some(Value::String(t)) => Some(t.as_str()),
            Some(Value::Array(parts)) => parts
                .iter()
                .find(|p| p.get("type").and_then(Value::as_str) == Some("text"))
                .and_then(|p| p.get("text"))
                .and_then(Value::as_str),
            _ => None,
        };
        let Some(text) = text
            .map(str::trim)
            .filter(|t| !t.is_empty() && !t.starts_with('<'))
        else {
            continue;
        };
        return Some(shorten(text));
    }
    None
}

/// One line, at most [`TOPIC_CHARS`] characters and an ellipsis.
fn shorten(text: &str) -> String {
    let one: String = text.split_whitespace().collect::<Vec<_>>().join(" ");
    if one.chars().count() > TOPIC_CHARS {
        format!(
            "{}…",
            one.chars().take(TOPIC_CHARS).collect::<String>().trim_end()
        )
    } else {
        one
    }
}

/// Just a folder (OpenCode's plugin passes the session's folder in `PLUTO_CWD`).
pub fn from_folder(path: &str) -> HookInput {
    parse(&serde_json::json!({ "cwd": path }).to_string())
}

/// Where the chat is, for the pet line: `DESKTOP-PET · “fix the tray menu”`.
pub fn place(input: &HookInput, request: Option<&str>) -> Option<String> {
    match (input.folder.as_deref(), request) {
        (Some(f), Some(r)) => Some(format!("{f} · “{r}”")),
        (Some(f), None) => Some(f.to_owned()),
        (None, Some(r)) => Some(format!("“{r}”")),
        (None, None) => None,
    }
}

/// The longest place text sent or shown.
pub const PLACE_MAX: usize = 80;

/// A place made safe to show: no control characters, at most [`PLACE_MAX`] characters.
pub fn clean_place(p: &str) -> Option<String> {
    let t: String = p
        .chars()
        .filter(|c| !c.is_control())
        .take(PLACE_MAX)
        .collect();
    let t = t.trim().to_owned();
    (!t.is_empty()).then_some(t)
}

/// The place travels as one word on the reaction line: percent-encoded UTF-8.
pub fn encode(p: &str) -> String {
    let mut out = String::new();
    for b in p.as_bytes() {
        if b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_' | b'.' | b'~') {
            out.push(*b as char);
        } else {
            out.push_str(&format!("%{b:02X}"));
        }
    }
    out
}

pub fn decode(w: &str) -> Option<String> {
    let b = w.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'%' {
            let hex = std::str::from_utf8(b.get(i + 1..i + 3)?).ok()?;
            out.push(u8::from_str_radix(hex, 16).ok()?);
            i += 3;
        } else {
            out.push(b[i]);
            i += 1;
        }
    }
    String::from_utf8(out).ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_hook_input_names_the_folder_and_spots_a_permission_request() {
        let h = parse(
            r#"{"session_id":"s","cwd":"E:\\Projects\\DESKTOP-PET\\","transcript_path":"C:\\t.jsonl","hook_event_name":"Notification","message":"Claude needs your permission to use Bash"}"#,
        );
        assert_eq!(h.folder.as_deref(), Some("DESKTOP-PET"));
        assert!(h.permission);
        assert_eq!(h.transcript, Some(PathBuf::from("C:\\t.jsonl")));
        let idle =
            parse(r#"{"cwd":"/home/me/staysync","message":"Claude is waiting for your input"}"#);
        assert_eq!(idle.folder.as_deref(), Some("staysync"));
        assert!(!idle.permission);
        assert_eq!(parse("not json"), HookInput::default());
    }

    #[test]
    fn cursor_and_codex_inputs_name_their_folder_and_codex_its_request() {
        let cursor = parse(
            r#"{"conversation_id":"c","status":"completed","hook_event_name":"stop","workspace_roots":["/Users/me/projects/staysync"]}"#,
        );
        assert_eq!(cursor.folder.as_deref(), Some("staysync"));
        let codex = parse(
            r#"{"type":"agent-turn-complete","cwd":"C:\\code\\pluto","input-messages":["","Rename the tray menu items and add a test for each"],"last-assistant-message":"Done"}"#,
        );
        assert_eq!(codex.folder.as_deref(), Some("pluto"));
        assert_eq!(
            codex.request.as_deref(),
            Some("Rename the tray menu items and a…")
        );
        assert_eq!(from_folder("/home/me/site").folder.as_deref(), Some("site"));
    }

    #[test]
    fn the_first_request_skips_commands_and_tool_results_and_is_shortened() {
        let t = [
            r#"{"type":"summary","summary":"x"}"#,
            r#"{"type":"user","message":{"role":"user","content":"<command-name>/clear</command-name>"}}"#,
            r#"{"type":"user","message":{"role":"user","content":[{"type":"tool_result","content":"ok"}]}}"#,
            r#"{"type":"user","message":{"role":"user","content":[{"type":"text","text":"Fix the   tray menu so it opens on the second monitor too"}]}}"#,
        ]
        .join("\n");
        assert_eq!(
            first_request(&t).as_deref(),
            Some("Fix the tray menu so it opens on…")
        );
        assert_eq!(
            first_request(r#"{"type":"user","message":{"content":"short one"}}"#).as_deref(),
            Some("short one")
        );
        assert_eq!(first_request(""), None);
    }

    #[test]
    fn the_place_reads_folder_then_request() {
        let h = HookInput {
            folder: Some("DESKTOP-PET".into()),
            ..Default::default()
        };
        assert_eq!(
            place(&h, Some("fix tray")).as_deref(),
            Some("DESKTOP-PET · “fix tray”")
        );
        assert_eq!(place(&h, None).as_deref(), Some("DESKTOP-PET"));
        assert_eq!(place(&HookInput::default(), None), None);
    }

    #[test]
    fn places_travel_as_one_word_and_come_back_the_same() {
        let p = "DESKTOP PET · “fix the tray” 日本";
        let w = encode(p);
        assert!(!w.contains(' '));
        assert_eq!(decode(&w).as_deref(), Some(p));
        assert_eq!(decode("%ZZ"), None);
        assert_eq!(clean_place("a\u{7}b").as_deref(), Some("ab"));
        assert_eq!(
            clean_place(&"x".repeat(200)).map(|s| s.len()),
            Some(PLACE_MAX)
        );
    }
}
