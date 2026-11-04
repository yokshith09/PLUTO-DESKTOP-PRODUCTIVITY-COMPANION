//! Chats waiting for you (A-1, owner-approved 2026-11-04): the number on the pet and its hover list.
//!
//! A chat is one assistant in one folder. It is added when the assistant needs you or asks for a
//! permission, and removed when you reply (a new hook), when that chat finishes, or after
//! [`EXPIRES_MS`]. Two chats in the same folder count once: a hook only says the folder.

use serde::Serialize;

/// How long a chat stays on the list without a word from it.
pub const EXPIRES_MS: i64 = 30 * 60 * 1000;
/// The most chats kept (the oldest go first).
pub const MAX: usize = 20;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Kind {
    /// The assistant asked you something or is waiting for your reply.
    Needs,
    /// The assistant is waiting for you to allow something.
    Permission,
}

/// One waiting chat, as shown on the pet.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Chat {
    pub assistant: String,
    /// The chat's folder ("DESKTOP-PET"); empty when the hook did not say.
    pub folder: String,
    /// What it wants: `to use Bash`, or the start of your request.
    pub detail: String,
    pub kind: Kind,
    /// Milliseconds since the epoch.
    pub since: i64,
    /// The window the chat runs in (A-4): the platform's handle, only ever handed back to the OS.
    /// Never sent to the pet; it gets `jump` instead.
    #[serde(skip)]
    pub window: Option<i64>,
    /// Whether a click can bring that chat's window forward.
    pub jump: bool,
}

/// What a hook's place text says: the folder, and what the chat wants.
/// `to use Bash · DESKTOP-PET · “fix tray”` → (`DESKTOP-PET`, `to use Bash`);
/// `DESKTOP-PET · “fix tray”` → (`DESKTOP-PET`, `“fix tray”`).
pub fn from_place(place: Option<&str>) -> (String, String) {
    let Some(place) = place else {
        return (String::new(), String::new());
    };
    let mut parts: Vec<&str> = place.split(" · ").map(str::trim).collect();
    let tool = (parts.first().is_some_and(|p| p.starts_with("to use "))).then(|| parts.remove(0));
    let (folder, request) = match parts.as_slice() {
        [] => ("", ""),
        [one] if one.starts_with('“') => ("", *one),
        [one] => (*one, ""),
        [f, r, ..] => (*f, *r),
    };
    (
        folder.to_owned(),
        tool.map_or_else(|| request.to_owned(), str::to_owned),
    )
}

#[derive(Debug, Default)]
pub struct Waiting {
    chats: Vec<Chat>,
}

impl Waiting {
    /// A chat needs you. The same assistant and folder replaces its earlier entry.
    pub fn raise(&mut self, mut chat: Chat) {
        // A word from the chat that found no window keeps the one an earlier word found.
        if chat.window.is_none() {
            chat.window = self
                .chats
                .iter()
                .find(|c| c.assistant == chat.assistant && c.folder == chat.folder)
                .and_then(|c| c.window);
        }
        chat.jump = chat.window.is_some();
        self.chats
            .retain(|c| !(c.assistant == chat.assistant && c.folder == chat.folder));
        self.chats.push(chat);
        if self.chats.len() > MAX {
            self.chats.remove(0);
        }
    }

    /// The chat replied or finished. A hook that names no folder clears the assistant's chats
    /// without one; true when something was removed.
    pub fn clear(&mut self, assistant: &str, folder: &str) -> bool {
        let before = self.chats.len();
        self.chats
            .retain(|c| !(c.assistant == assistant && c.folder == folder));
        self.chats.len() != before
    }

    /// Drops what has waited too long; true when something went.
    pub fn expire(&mut self, now: i64) -> bool {
        let before = self.chats.len();
        self.chats.retain(|c| now - c.since < EXPIRES_MS);
        self.chats.len() != before
    }

    /// The window to bring forward for a chat (A-4): the chat of `assistant` in `folder`, or with no
    /// folder the one that has waited least long (a bubble only names the assistant).
    pub fn window_of(&self, assistant: &str, folder: Option<&str>) -> Option<i64> {
        self.chats
            .iter()
            .rev()
            .filter(|c| c.assistant == assistant && folder.is_none_or(|f| c.folder == f))
            .find_map(|c| c.window)
    }

    pub fn list(&self) -> Vec<Chat> {
        self.chats.clone()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn chat(assistant: &str, folder: &str, kind: Kind, since: i64) -> Chat {
        Chat {
            assistant: assistant.into(),
            folder: folder.into(),
            detail: String::new(),
            kind,
            since,
            window: None,
            jump: false,
        }
    }

    #[test]
    fn the_same_chat_counts_once_and_a_new_word_from_it_replaces_the_old() {
        let mut w = Waiting::default();
        w.raise(chat("Claude Code", "app", Kind::Needs, 1));
        w.raise(chat("Claude Code", "app", Kind::Permission, 5));
        w.raise(chat("Claude Code", "site", Kind::Needs, 6));
        w.raise(chat("Codex", "app", Kind::Needs, 7));
        let l = w.list();
        assert_eq!(l.len(), 3);
        // The first "app" entry was replaced by the later one; order is by when each last asked.
        assert_eq!(
            (l[0].folder.as_str(), l[0].kind, l[0].since),
            ("app", Kind::Permission, 5)
        );
        assert_eq!(l[1].folder, "site");
        assert_eq!(l[2].assistant, "Codex");
    }

    #[test]
    fn replying_or_finishing_clears_only_that_chat() {
        let mut w = Waiting::default();
        w.raise(chat("Claude Code", "app", Kind::Needs, 1));
        w.raise(chat("Claude Code", "site", Kind::Needs, 2));
        assert!(w.clear("Claude Code", "app"));
        assert!(!w.clear("Claude Code", "app"), "nothing left to clear");
        assert!(!w.clear("Codex", "site"), "another assistant's chat stays");
        assert_eq!(w.list().len(), 1);
    }

    #[test]
    fn a_chat_expires_after_half_an_hour() {
        let mut w = Waiting::default();
        w.raise(chat("A", "x", Kind::Needs, 0));
        w.raise(chat("A", "y", Kind::Needs, EXPIRES_MS - 1));
        assert!(w.expire(EXPIRES_MS));
        assert_eq!(w.list().len(), 1);
        assert!(!w.expire(EXPIRES_MS));
    }

    #[test]
    fn at_most_twenty_are_kept() {
        let mut w = Waiting::default();
        for i in 0..30 {
            w.raise(chat("A", &format!("f{i}"), Kind::Needs, i));
        }
        let l = w.list();
        assert_eq!(l.len(), MAX);
        assert_eq!(l[0].folder, "f10");
    }

    #[test]
    fn the_folder_and_what_it_wants_come_out_of_the_place_text() {
        assert_eq!(
            from_place(Some("to use Bash · DESKTOP-PET · “fix tray”")),
            ("DESKTOP-PET".into(), "to use Bash".into())
        );
        assert_eq!(
            from_place(Some("DESKTOP-PET · “fix tray”")),
            ("DESKTOP-PET".into(), "“fix tray”".into())
        );
        assert_eq!(
            from_place(Some("DESKTOP-PET")),
            ("DESKTOP-PET".into(), String::new())
        );
        assert_eq!(
            from_place(Some("“fix tray”")),
            (String::new(), "“fix tray”".into())
        );
        assert_eq!(
            from_place(Some("to use shell")),
            (String::new(), "to use shell".into())
        );
        assert_eq!(from_place(None), (String::new(), String::new()));
    }

    #[test]
    fn a_chat_remembers_its_window_and_a_bubble_finds_the_latest_one() {
        let mut w = Waiting::default();
        let mut a = chat("Claude Code", "app", Kind::Needs, 1);
        a.window = Some(111);
        w.raise(a);
        let mut b = chat("Claude Code", "site", Kind::Permission, 2);
        b.window = Some(222);
        w.raise(b);
        w.raise(chat("Codex", "app", Kind::Needs, 3));
        assert_eq!(w.window_of("Claude Code", Some("app")), Some(111));
        assert_eq!(w.window_of("Claude Code", None), Some(222));
        assert_eq!(
            w.window_of("Codex", None),
            None,
            "no window found, nothing to jump to"
        );
        // A later word that found no window keeps the first one, and the row says it can jump.
        w.raise(chat("Claude Code", "app", Kind::Permission, 9));
        assert_eq!(w.window_of("Claude Code", Some("app")), Some(111));
        assert!(
            w.list()
                .iter()
                .find(|c| c.folder == "app" && c.assistant == "Claude Code")
                .unwrap()
                .jump
        );
        assert!(
            !w.list()
                .iter()
                .find(|c| c.assistant == "Codex")
                .unwrap()
                .jump
        );
    }
}
