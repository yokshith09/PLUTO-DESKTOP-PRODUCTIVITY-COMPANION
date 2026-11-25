//! The anonymous user count, app side (MASTER_PLAN PW "Revised plan", A1 and A3).
//!
//! What the app sends, and only this: a random install number (made here on first run, linked to
//! nothing), the OS name and Pluto's version. On first open it says hello and gets a token back;
//! after that it pings at most once per day (UTC, the server's day) while Pluto is open. The server
//! learns "this install was open today", nothing else (website/privacy.html, "The one thing we keep").
//!
//! This module is the pure rule plus the small file it keeps (`count.json` beside the database,
//! deliberately not in the database: a backup restored on another computer must not carry the
//! install number with it). The network request itself lives in the Tauri shell; core stays
//! network-free.

use std::fs;
use std::path::Path;

use chrono::NaiveDate;
use serde::{Deserialize, Serialize};

/// The file, in the app's data folder.
pub const FILE: &str = "count.json";

/// What the app remembers between runs.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CountState {
    /// Random (UUID v4), made once on this computer.
    pub install_id: String,
    /// From the server's hello reply; `None` until hello has worked.
    #[serde(default)]
    pub token: Option<String>,
    /// The last UTC day the server counted this install (hello or ping).
    #[serde(default)]
    pub last_day: Option<NaiveDate>,
}

impl CountState {
    pub fn new() -> Self {
        Self {
            install_id: uuid::Uuid::new_v4().to_string(),
            token: None,
            last_day: None,
        }
    }
}

impl Default for CountState {
    fn default() -> Self {
        Self::new()
    }
}

/// What to send now.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Action {
    /// First open (or the server forgot this install): register it.
    Hello,
    /// Already registered, not yet counted today.
    Ping,
    /// Counted today already.
    Nothing,
}

/// The rule: hello until there is a token, then one ping per UTC day.
pub fn next_action(state: &CountState, today: NaiveDate) -> Action {
    match (&state.token, state.last_day) {
        (None, _) => Action::Hello,
        (Some(_), Some(day)) if day >= today => Action::Nothing,
        (Some(_), _) => Action::Ping,
    }
}

/// The JSON body for [`Action::Hello`] or [`Action::Ping`]: exactly the fields the server accepts
/// (`server/src/api.ts`, `parseBody`), nothing more.
pub fn body(state: &CountState, action: Action, os: &str, version: &str) -> Option<String> {
    let mut o = serde_json::Map::new();
    o.insert("install_id".into(), state.install_id.clone().into());
    o.insert("os".into(), os.into());
    o.insert("version".into(), version.into());
    match action {
        Action::Hello => {}
        Action::Ping => {
            o.insert("token".into(), state.token.clone()?.into());
        }
        Action::Nothing => return None,
    }
    Some(serde_json::Value::Object(o).to_string())
}

/// The server's answer, reduced to what the app does next.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Reply {
    /// Hello worked: keep this token.
    Registered(String),
    /// Ping worked.
    Counted,
    /// The server doesn't know this install or its token any more (for example its keys were
    /// changed): forget the token and say hello again next time.
    Forgotten,
    /// Anything else (offline, rate-limited, server error): try again later, change nothing.
    TryLater,
}

/// Reads the server's status and body for the request that was sent.
pub fn read_reply(action: Action, status: u16, body: &str) -> Reply {
    match (action, status) {
        (Action::Hello, 200) => serde_json::from_str::<serde_json::Value>(body)
            .ok()
            .and_then(|v| v.get("token")?.as_str().map(str::to_owned))
            .filter(|t| t.len() == 64 && t.bytes().all(|b| b.is_ascii_hexdigit()))
            .map_or(Reply::TryLater, Reply::Registered),
        (Action::Ping, 200..=204) => Reply::Counted,
        (Action::Ping, 403 | 409) => Reply::Forgotten,
        _ => Reply::TryLater,
    }
}

/// Applies a reply to the state. Returns whether anything changed (and must be saved).
pub fn apply(state: &mut CountState, reply: &Reply, today: NaiveDate) -> bool {
    match reply {
        Reply::Registered(token) => {
            state.token = Some(token.clone());
            state.last_day = Some(today);
            true
        }
        Reply::Counted => {
            state.last_day = Some(today);
            true
        }
        Reply::Forgotten => {
            state.token = None;
            true
        }
        Reply::TryLater => false,
    }
}

/// Loads the state, or makes a new install number if the file is missing or unreadable.
/// Returns the state and whether it is new (so it gets saved before anything is sent).
pub fn load(dir: &Path) -> (CountState, bool) {
    let parsed = fs::read_to_string(dir.join(FILE))
        .ok()
        .and_then(|s| serde_json::from_str::<CountState>(&s).ok())
        .filter(|s| uuid::Uuid::parse_str(&s.install_id).is_ok_and(|u| u.get_version_num() == 4));
    match parsed {
        Some(state) => (state, false),
        None => (CountState::new(), true),
    }
}

/// Saves the state (write to a temporary file, then rename, so a crash never leaves half a file).
pub fn save(dir: &Path, state: &CountState) -> std::io::Result<()> {
    let tmp = dir.join(format!("{FILE}.tmp"));
    fs::write(
        &tmp,
        serde_json::to_vec_pretty(state).map_err(std::io::Error::other)?,
    )?;
    fs::rename(tmp, dir.join(FILE))
}

/// The OS name the server accepts.
pub fn os_name() -> &'static str {
    if cfg!(target_os = "windows") {
        "windows"
    } else if cfg!(target_os = "macos") {
        "macos"
    } else {
        "linux"
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn day(s: &str) -> NaiveDate {
        s.parse().unwrap()
    }
    const TOKEN: &str = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

    #[test]
    fn hello_first_then_one_ping_a_day() {
        let mut s = CountState::new();
        let today = day("2026-12-01");
        assert_eq!(next_action(&s, today), Action::Hello);
        let reply = read_reply(Action::Hello, 200, &format!(r#"{{"token":"{TOKEN}"}}"#));
        assert!(apply(&mut s, &reply, today));
        assert_eq!(
            next_action(&s, today),
            Action::Nothing,
            "hello counts as today"
        );
        let tomorrow = day("2026-12-02");
        assert_eq!(next_action(&s, tomorrow), Action::Ping);
        assert!(apply(&mut s, &read_reply(Action::Ping, 204, ""), tomorrow));
        assert_eq!(next_action(&s, tomorrow), Action::Nothing);
        // Offline for a week: one ping when back, not seven.
        assert_eq!(next_action(&s, day("2026-12-09")), Action::Ping);
    }

    #[test]
    fn the_body_has_only_what_the_server_accepts() {
        let mut s = CountState::new();
        let hello: serde_json::Value =
            serde_json::from_str(&body(&s, Action::Hello, "windows", "0.6.0").unwrap()).unwrap();
        let mut keys: Vec<_> = hello.as_object().unwrap().keys().cloned().collect();
        keys.sort();
        assert_eq!(keys, ["install_id", "os", "version"]);
        assert_eq!(
            body(&s, Action::Ping, "windows", "0.6.0"),
            None,
            "no ping without a token"
        );
        s.token = Some(TOKEN.into());
        let ping: serde_json::Value =
            serde_json::from_str(&body(&s, Action::Ping, "macos", "0.6.0").unwrap()).unwrap();
        assert_eq!(ping["token"], TOKEN);
        assert_eq!(ping.as_object().unwrap().len(), 4);
        assert_eq!(body(&s, Action::Nothing, "macos", "0.6.0"), None);
    }

    #[test]
    fn replies_the_app_cannot_use_change_nothing() {
        let mut s = CountState::new();
        let before = s.clone();
        for (action, status, text) in [
            (Action::Hello, 200, "not json"),
            (Action::Hello, 200, r#"{"token":"short"}"#),
            (Action::Hello, 429, ""),
            (Action::Hello, 503, r#"{"error":"Not set up."}"#),
            (Action::Ping, 500, ""),
            (Action::Ping, 400, ""),
        ] {
            let reply = read_reply(action, status, text);
            assert_eq!(reply, Reply::TryLater, "{action:?} {status} {text}");
            assert!(!apply(&mut s, &reply, day("2026-12-01")));
        }
        assert_eq!(s, before);
    }

    #[test]
    fn a_forgotten_install_says_hello_again_with_the_same_number() {
        let mut s = CountState {
            token: Some(TOKEN.into()),
            last_day: Some(day("2026-11-30")),
            ..CountState::new()
        };
        let id = s.install_id.clone();
        for status in [403, 409] {
            s.token = Some(TOKEN.into());
            assert_eq!(read_reply(Action::Ping, status, ""), Reply::Forgotten);
            apply(&mut s, &Reply::Forgotten, day("2026-12-01"));
            assert_eq!(next_action(&s, day("2026-12-01")), Action::Hello);
        }
        assert_eq!(s.install_id, id);
    }

    #[test]
    fn the_install_number_is_kept_and_a_broken_file_starts_over() {
        let dir = tempfile::tempdir().unwrap();
        let (first, new) = load(dir.path());
        assert!(new);
        assert!(
            uuid::Uuid::parse_str(&first.install_id)
                .unwrap()
                .get_version_num()
                == 4
        );
        save(dir.path(), &first).unwrap();
        let (again, new) = load(dir.path());
        assert!(!new);
        assert_eq!(again, first);
        fs::write(dir.path().join(FILE), "{ broken").unwrap();
        assert!(load(dir.path()).1);
        fs::write(dir.path().join(FILE), r#"{"install_id":"not-a-uuid"}"#).unwrap();
        assert!(load(dir.path()).1);
    }

    #[test]
    fn os_name_is_one_the_server_accepts() {
        assert!(["windows", "macos", "linux"].contains(&os_name()));
    }
}
