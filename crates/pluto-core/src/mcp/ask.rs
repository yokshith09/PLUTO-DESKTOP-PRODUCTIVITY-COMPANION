//! Asking the person, on the pet (owner 2026-11-01: "settings only with the user's Allow"; and
//! 2026-11-02: "the assistant asks you a question through the pet"). The pet shows a small card
//! with the question and two to four buttons; no answer in [`ANSWER_WAIT`] counts as no.

use std::time::Duration;

use rmcp::schemars;
use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::read::Data;
use super::write::{Change, Done, Undo};
use super::{clean_bubble, Host};

/// How long the pet waits for an answer.
pub const ANSWER_WAIT: Duration = Duration::from_secs(120);

/// A question for the pet's card.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Question {
    /// Who asks and what about, e.g. "Claude Code wants to change a setting".
    pub title: String,
    /// The question or the change, e.g. "Theme: dark → light".
    pub detail: String,
    /// The buttons, in order; the first is the main one.
    pub options: Vec<String>,
}

/// The settings an assistant may change, with the name the person sees. Never assistants
/// themselves, tracking, shortcuts or start-up: those stay with the person.
pub const SETTINGS: &[(&str, &str)] = &[
    ("general.theme", "Theme"),
    ("pet.size", "Pet size"),
    ("pet.hover_card", "Hover card"),
    ("pet.typing", "Pet types along"),
    ("pet.hide_fullscreen", "Hide the pet in full screen"),
    ("pet.always_on_top", "Pet always on top"),
    ("mcp.focus_guard", "Quiet while you focus"),
];

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct AskArgs {
    /// The question, plain text, at most 140 characters.
    pub question: String,
    /// Two to four short answers (at most 30 characters each) shown as buttons.
    pub options: Vec<String>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct SettingArgs {
    /// One of: general.theme (system, light, dark), pet.size (S, M, L), pet.hover_card,
    /// pet.typing, pet.hide_fullscreen, pet.always_on_top, mcp.focus_guard (true or false).
    pub key: String,
    pub value: Value,
}

/// The answer to `ask_person`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, schemars::JsonSchema)]
pub struct Answer {
    /// The button the person pressed, or null when they did not answer in two minutes.
    pub answer: Option<String>,
}

fn shown(v: &Value) -> String {
    match v {
        Value::Bool(true) => "on".into(),
        Value::Bool(false) => "off".into(),
        Value::String(s) => s.clone(),
        Value::Null => "none".into(),
        other => other.to_string(),
    }
}

/// Checks the question and its buttons.
pub fn question(assistant: &str, a: &AskArgs) -> Result<Question, String> {
    let detail = clean_bubble(&a.question)?;
    if !(2..=4).contains(&a.options.len()) {
        return Err("Give two to four options.".into());
    }
    let mut options = Vec::new();
    for o in &a.options {
        let o = o.split_whitespace().collect::<Vec<_>>().join(" ");
        if o.is_empty() || o.chars().count() > 30 {
            return Err("Each option needs 1 to 30 characters.".into());
        }
        options.push(o);
    }
    Ok(Question {
        title: format!("{assistant} asks"),
        detail,
        options,
    })
}

pub async fn ask(host: &dyn Host, assistant: &str, a: AskArgs) -> Result<Answer, String> {
    let q = question(assistant, &a)?;
    Ok(Answer {
        answer: host.ask(q).await,
    })
}

/// Changes one setting after the person presses Allow on the pet.
pub async fn setting_change(
    host: &dyn Host,
    data: &Data,
    assistant: &str,
    a: SettingArgs,
) -> Result<(Done, Change), String> {
    let Some((key, label)) = SETTINGS.iter().find(|(k, _)| *k == a.key.trim()) else {
        let names: Vec<&str> = SETTINGS.iter().map(|(k, _)| *k).collect();
        return Err(format!("Assistants may change only: {}.", names.join(", ")));
    };
    if let Some(e) = crate::settings::validate(key, &a.value) {
        return Err(e.message);
    }
    let settings = data
        .settings
        .as_ref()
        .ok_or("Pluto's settings are not open yet.")?;
    let all = settings.get_all().await.map_err(|e| e.message)?;
    let before = all.get(*key).cloned().unwrap_or(Value::Null);
    if before == a.value {
        return Err(format!("{label} is already {}.", shown(&a.value)));
    }
    let q = Question {
        title: format!("{assistant} wants to change a setting"),
        detail: format!("{label}: {} → {}", shown(&before), shown(&a.value)),
        options: vec!["Allow".into(), "Deny".into()],
    };
    match host.ask(q).await.as_deref() {
        Some("Allow") => {}
        Some(_) => return Err("The person said no.".into()),
        None => return Err("The person did not answer, so nothing changed.".into()),
    }
    settings
        .set(key, a.value.clone())
        .await
        .map_err(|e| e.message)?;
    let summary = format!("Changed {label} to {}.", shown(&a.value));
    Ok((
        Done {
            id: (*key).to_owned(),
            summary: summary.clone(),
        },
        Change {
            summary,
            undo: Some(Undo::SettingChanged {
                key: (*key).to_owned(),
                before,
            }),
        },
    ))
}
