//! What assistants asked Pluto to do, for the Assistants page: the last [`KEEP`] calls, in
//! memory only (gone when Pluto closes), never the text of the person's tasks or notes.

use std::collections::VecDeque;
use std::sync::{Mutex, PoisonError};

use serde::Serialize;

use super::write::Undo;

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
    /// True when the call changed something in Pluto.
    pub changed: bool,
    /// The id to pass to undo, when the change can be undone and has not been yet.
    #[cfg_attr(feature = "ts", ts(type = "number | null"))]
    pub undo_id: Option<u64>,
    /// True once the change was undone.
    pub undone: bool,
}

/// The recent calls, newest last inside, newest first out.
#[derive(Debug, Default)]
struct Inner {
    calls: VecDeque<(Call, Option<Undo>)>,
    next_id: u64,
}

#[derive(Debug, Default)]
pub struct Activity(Mutex<Inner>);

impl Activity {
    pub fn record(&self, call: Call) {
        self.push(call, None);
    }

    /// Notes a change with its way back; the call gets an undo id when there is one.
    pub fn record_change(&self, mut call: Call, undo: Option<Undo>) {
        call.changed = true;
        self.push(call, undo);
    }

    fn push(&self, mut call: Call, undo: Option<Undo>) {
        let mut inner = self.0.lock().unwrap_or_else(PoisonError::into_inner);
        if undo.is_some() {
            inner.next_id += 1;
            call.undo_id = Some(inner.next_id);
        }
        if inner.calls.len() == KEEP {
            inner.calls.pop_front();
        }
        inner.calls.push_back((call, undo));
    }

    /// Newest first.
    pub fn recent(&self) -> Vec<Call> {
        let inner = self.0.lock().unwrap_or_else(PoisonError::into_inner);
        inner.calls.iter().rev().map(|(c, _)| c.clone()).collect()
    }

    /// The way back for this change, if it has not been undone.
    pub fn undo_for(&self, id: u64) -> Option<Undo> {
        let inner = self.0.lock().unwrap_or_else(PoisonError::into_inner);
        inner
            .calls
            .iter()
            .find(|(c, _)| c.undo_id == Some(id) && !c.undone)
            .and_then(|(_, u)| u.clone())
    }

    /// Marks the change undone; false when it already was (so it is never undone twice).
    pub fn mark_undone(&self, id: u64) -> bool {
        let mut inner = self.0.lock().unwrap_or_else(PoisonError::into_inner);
        match inner
            .calls
            .iter_mut()
            .find(|(c, _)| c.undo_id == Some(id) && !c.undone)
        {
            Some((call, undo)) => {
                call.undone = true;
                *undo = None;
                true
            }
            None => false,
        }
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
            undo_id: None,
            undone: false,
        }
    }

    #[test]
    fn a_change_can_be_undone_once() {
        let a = Activity::default();
        a.record(call(1));
        a.record_change(call(2), Some(Undo::ReminderAdded { id: "r".into() }));
        let id = a.recent()[0].undo_id.unwrap();
        assert!(a.recent()[0].changed);
        assert_eq!(a.undo_for(id), Some(Undo::ReminderAdded { id: "r".into() }));
        assert!(a.mark_undone(id));
        assert!(a.recent()[0].undone);
        assert_eq!(a.undo_for(id), None);
        assert!(!a.mark_undone(id), "not twice");
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
