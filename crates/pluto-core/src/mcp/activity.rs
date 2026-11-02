//! What assistants asked Pluto to do, for the Assistants page: the last [`KEEP`] calls, in
//! memory only (gone when Pluto closes), never the text of the person's tasks or notes.

use std::collections::VecDeque;
use std::sync::{Mutex, PoisonError};

use serde::Serialize;

/// How many calls the page can show.
pub const KEEP: usize = 50;

/// One call an assistant made.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[cfg_attr(
    feature = "ts",
    derive(ts_rs::TS),
    ts(export, rename = "AssistantCall")
)]
#[serde(rename_all = "camelCase")]
pub struct Call {
    #[cfg_attr(feature = "ts", ts(type = "number"))]
    pub at_ms: i64,
    /// The assistant's name as Pluto shows it.
    pub assistant: String,
    /// The tool it called.
    pub tool: String,
    /// False when Pluto refused (rate limit, bad input).
    pub ok: bool,
    /// What happened, in a few words.
    pub detail: String,
    /// True when the call changed something in Pluto (none yet: P4.1a only shows things).
    pub changed: bool,
}

/// The recent calls, newest last inside, newest first out.
#[derive(Debug, Default)]
pub struct Activity(Mutex<VecDeque<Call>>);

impl Activity {
    pub fn record(&self, call: Call) {
        let mut calls = self.0.lock().unwrap_or_else(PoisonError::into_inner);
        if calls.len() == KEEP {
            calls.pop_front();
        }
        calls.push_back(call);
    }

    /// Newest first.
    pub fn recent(&self) -> Vec<Call> {
        let calls = self.0.lock().unwrap_or_else(PoisonError::into_inner);
        calls.iter().rev().cloned().collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn call(n: i64) -> Call {
        Call {
            at_ms: n,
            assistant: "Claude Code".into(),
            tool: "say".into(),
            ok: true,
            detail: String::new(),
            changed: false,
        }
    }

    #[test]
    fn keeps_the_newest_calls_newest_first() {
        let a = Activity::default();
        for n in 0..(KEEP as i64 + 5) {
            a.record(call(n));
        }
        let recent = a.recent();
        assert_eq!(recent.len(), KEEP);
        assert_eq!(recent[0].at_ms, KEEP as i64 + 4);
        assert_eq!(recent[KEEP - 1].at_ms, 5);
    }
}
