//! What the person lets each assistant do (owner 2026-11-09: "all the tools and things should be
//! inside the connector setup editor"). Two things can be switched off per assistant: a tool
//! (the assistant is refused with a plain sentence) and a pet reaction (the pet stays quiet for it).
//!
//! Stored as the preference `mcp.perms`, as lists of what is OFF, so everything is on by default and
//! a tool or reaction added later starts on:
//! `{"claude": {"tools": ["task_add"], "reactions": ["away"]}}`.
//! The key is the assistant's tile id (see [`owner`]); a broken or unknown value changes nothing.

use std::collections::BTreeMap;

use serde_json::Value;

pub const PERMS_PREF: &str = "mcp.perms";

/// Every tool an assistant can call: name, what the person sees, and whether it changes things.
/// A test keeps this list equal to the tools the server really offers.
pub const TOOLS: &[(&str, &str, bool)] = &[
    ("status", "See what Pluto is doing", false),
    ("today", "Read today's plan", false),
    ("tasks_list", "Read your tasks", false),
    ("task_get", "Read one task", false),
    ("notes_search", "Search your notes", false),
    ("note_get", "Read one note", false),
    ("reminders_list", "Read reminders", false),
    ("meetings_list", "Read meetings", false),
    ("react", "Make the pet react", false),
    ("say", "Show a short bubble on the pet", false),
    ("ask_person", "Ask you a question on the pet", false),
    ("task_add", "Add a task", true),
    ("task_update", "Change a task", true),
    ("task_complete", "Mark a task done", true),
    ("reminder_add", "Add a reminder", true),
    ("reminder_delete", "Move a reminder to the Bin", true),
    ("meeting_delete", "Move a meeting to the Bin", true),
    ("note_add", "Add a note", true),
    ("note_append", "Add to a note", true),
    ("setting_change", "Change a setting (you press Allow)", true),
];

/// The pet reactions that can be switched off, by key.
pub const REACTIONS: &[(&str, &str)] = &[
    ("needs", "Needs you or asks permission"),
    ("done", "Done"),
    ("away", "Welcome-back note"),
    ("long_run", "Says when a chat runs long"),
    ("click", "Click goes to its window"),
];

/// The tile an assistant's display name belongs to (what the Assistants page keys on); a name
/// Pluto does not know keeps itself, lower-cased.
pub fn owner(display: &str) -> String {
    match display {
        "Claude Code" | "Claude" => "claude".into(),
        "VS Code" => "vscode".into(),
        "Cursor" => "cursor".into(),
        "Codex" => "codex".into(),
        "OpenCode" => "opencode".into(),
        "Windsurf" => "windsurf".into(),
        "Antigravity" => "antigravity".into(),
        other => other.to_lowercase(),
    }
}

#[derive(Debug, Clone, Default, PartialEq)]
struct Off {
    tools: Vec<String>,
    reactions: Vec<String>,
}

/// What is switched off, for every assistant.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct Perms(BTreeMap<String, Off>);

fn names(value: Option<&Value>) -> Vec<String> {
    value
        .and_then(Value::as_array)
        .map(|a| {
            a.iter()
                .filter_map(Value::as_str)
                .map(str::to_owned)
                .collect()
        })
        .unwrap_or_default()
}

impl Perms {
    /// Reads the saved preference; anything unreadable means "nothing is off".
    pub fn parse(raw: Option<&Value>) -> Self {
        let Some(map) = raw.and_then(Value::as_object) else {
            return Self::default();
        };
        Self(
            map.iter()
                .map(|(who, v)| {
                    (
                        who.clone(),
                        Off {
                            tools: names(v.get("tools")),
                            reactions: names(v.get("reactions")),
                        },
                    )
                })
                .collect(),
        )
    }

    /// May the assistant (by display name) call this tool?
    pub fn tool_on(&self, display: &str, tool: &str) -> bool {
        self.0
            .get(&owner(display))
            .is_none_or(|o| !o.tools.iter().any(|t| t == tool))
    }

    /// Should the pet react in this way for the assistant (by display name)?
    pub fn reaction_on(&self, display: &str, key: &str) -> bool {
        self.0
            .get(&owner(display))
            .is_none_or(|o| !o.reactions.iter().any(|r| r == key))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn everything_is_on_until_switched_off() {
        let p = Perms::parse(None);
        assert!(p.tool_on("Claude Code", "task_add"));
        assert!(p.reaction_on("Codex", "away"));
    }

    #[test]
    fn off_lists_apply_to_one_assistant_by_its_tile() {
        let p = Perms::parse(Some(
            &json!({"claude": {"tools": ["task_add"], "reactions": ["away"]}}),
        ));
        assert!(!p.tool_on("Claude Code", "task_add"));
        assert!(
            !p.tool_on("Claude", "task_add"),
            "both names are the claude tile"
        );
        assert!(p.tool_on("Claude Code", "tasks_list"));
        assert!(p.tool_on("Codex", "task_add"));
        assert!(!p.reaction_on("Claude Code", "away"));
        assert!(p.reaction_on("Claude Code", "needs"));
    }

    #[test]
    fn unknown_assistants_key_by_lowercase_name() {
        let p = Perms::parse(Some(&json!({"my agent": {"tools": ["say"]}})));
        assert!(!p.tool_on("My Agent", "say"));
    }

    #[test]
    fn broken_values_change_nothing() {
        for raw in [
            json!("x"),
            json!(3),
            json!([1]),
            json!({"claude": 5}),
            json!({"claude": {"tools": "task_add"}}),
        ] {
            let p = Perms::parse(Some(&raw));
            assert!(p.tool_on("Claude Code", "task_add"), "{raw}");
        }
    }

    #[test]
    fn tool_list_has_no_duplicates() {
        let mut names: Vec<_> = TOOLS.iter().map(|t| t.0).collect();
        names.sort_unstable();
        names.dedup();
        assert_eq!(names.len(), TOOLS.len());
    }
}
