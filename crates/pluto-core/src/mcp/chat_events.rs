//! Assistant chat events saved for a project's Activity (A-2).

use serde::{Deserialize, Serialize};

/// One assistant event shown in a project's Activity. The folder is only the final path segment.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatEvent {
    pub assistant: String,
    pub folder: String,
    /// `done`, `needs`, or `permission`.
    pub kind: String,
    pub at_ms: i64,
}

/// How many chat events are kept (newest first), across all projects.
pub const EVENTS_KEPT: usize = 500;
/// The preference containing the saved chat events.
pub const EVENTS_PREF: &str = "dev.chat_events";
const REPEAT_MS: i64 = 60 * 1_000;

/// The kept events from the stored preference (malformed entries dropped).
pub fn events_from(stored: Option<&serde_json::Value>) -> Vec<ChatEvent> {
    stored
        .and_then(serde_json::Value::as_array)
        .map(|list| {
            list.iter()
                .filter_map(|value| serde_json::from_value::<ChatEvent>(value.clone()).ok())
                .filter(|event| matches!(event.kind.as_str(), "done" | "needs" | "permission"))
                .take(EVENTS_KEPT)
                .collect()
        })
        .unwrap_or_default()
}

/// Adds an event at the front and keeps at most [`EVENTS_KEPT`]. Identical consecutive hook
/// events less than a minute apart replace the newest entry instead.
pub fn remember(events: &mut Vec<ChatEvent>, event: ChatEvent) {
    if let Some(newest) = events.first_mut() {
        if newest.assistant == event.assistant
            && newest.folder == event.folder
            && newest.kind == event.kind
            && event.at_ms >= newest.at_ms
            && event.at_ms - newest.at_ms < REPEAT_MS
        {
            *newest = event;
            return;
        }
    }
    events.insert(0, event);
    events.truncate(EVENTS_KEPT);
}

#[cfg(test)]
mod tests {
    use super::*;

    fn event(assistant: &str, folder: &str, kind: &str, at_ms: i64) -> ChatEvent {
        ChatEvent {
            assistant: assistant.into(),
            folder: folder.into(),
            kind: kind.into(),
            at_ms,
        }
    }

    #[test]
    fn events_from_drops_junk_and_unknown_kinds() {
        let events = events_from(Some(&serde_json::json!([
            { "assistant": "Claude Code", "folder": "Pluto", "kind": "done", "atMs": 2 },
            { "assistant": "Claude Code", "folder": "Pluto", "kind": "error", "atMs": 1 },
            { "folder": "Pluto" },
            3,
        ])));
        assert_eq!(events, vec![event("Claude Code", "Pluto", "done", 2)]);
        assert!(events_from(None).is_empty());
    }

    #[test]
    fn remember_keeps_newest_first_and_caps_the_list() {
        let mut events = vec![event("Claude Code", "one", "done", 1)];
        remember(&mut events, event("Claude Code", "two", "needs", 2));
        assert_eq!(events[0].folder, "two");
        for at_ms in 3..=600 {
            remember(
                &mut events,
                event("Cursor", &format!("folder-{at_ms}"), "done", at_ms),
            );
        }
        assert_eq!(events.len(), EVENTS_KEPT);
        assert_eq!(events[0].folder, "folder-600");
    }

    #[test]
    fn remember_collapses_only_a_recent_identical_newest_event() {
        let mut events = vec![event("Claude Code", "Pluto", "done", 100)];
        remember(&mut events, event("Claude Code", "Pluto", "done", 59_999));
        assert_eq!(events, vec![event("Claude Code", "Pluto", "done", 59_999)]);
        remember(&mut events, event("Claude Code", "Pluto", "done", 119_999));
        assert_eq!(events.len(), 2);
        remember(&mut events, event("Claude Code", "Pluto", "needs", 120_000));
        assert_eq!(events.len(), 3);
    }
}
