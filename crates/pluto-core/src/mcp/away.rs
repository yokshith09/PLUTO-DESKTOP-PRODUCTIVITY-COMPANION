//! Chats that spoke while the person was away (A-3).

use crate::mcp::clean_bubble;
use crate::usage::IDLE_THRESHOLD_MS;

const BACK_IDLE_MS: u64 = 3_000;
const EXPIRE_MS: i64 = 8 * 60 * 60 * 1_000;
const MAX_MISSED: usize = 10;

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum Kind {
    Finished,
    Needs,
    Permission,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Missed {
    pub assistant: String,
    pub folder: String,
    pub kind: Kind,
    pub at_ms: i64,
}

#[derive(Debug, Default)]
pub struct Away {
    missed: Vec<Missed>,
}

impl Away {
    /// Remembers a chat only when it spoke while the person was away.
    pub fn note(&mut self, mut missed: Missed, idle_ms: u64, now: i64) {
        if idle_ms < IDLE_THRESHOLD_MS {
            return;
        }
        if let Some(existing) = self
            .missed
            .iter_mut()
            .find(|entry| entry.assistant == missed.assistant && entry.folder == missed.folder)
        {
            existing.kind = existing.kind.max(missed.kind);
            existing.at_ms = now;
            return;
        }
        if self.missed.len() == MAX_MISSED {
            self.missed.remove(0);
        }
        missed.at_ms = now;
        self.missed.push(missed);
    }

    /// Announces what happened once the person has resumed input, then forgets it.
    pub fn back(&mut self, idle_ms: u64, now: i64) -> Option<String> {
        self.missed
            .retain(|entry| now.saturating_sub(entry.at_ms) <= EXPIRE_MS);
        if idle_ms >= BACK_IDLE_MS || self.missed.is_empty() {
            return None;
        }
        let missed = std::mem::take(&mut self.missed);
        clean_bubble(&message(&missed)).ok()
    }

    pub fn is_empty(&self) -> bool {
        self.missed.is_empty()
    }

    #[cfg(test)]
    pub fn len(&self) -> usize {
        self.missed.len()
    }
}

fn message(missed: &[Missed]) -> String {
    if missed.len() == 1 {
        let one = &missed[0];
        let place = if one.folder.is_empty() {
            String::new()
        } else {
            format!(" in {}", one.folder)
        };
        return match one.kind {
            Kind::Finished => format!(
                "Welcome back. {} finished{place} while you were away.",
                one.assistant
            ),
            Kind::Needs => format!("Welcome back. {} needs you{place}.", one.assistant),
            Kind::Permission => format!(
                "Welcome back. {} asked for permission{place}.",
                one.assistant
            ),
        };
    }

    let names: Vec<&str> = missed
        .iter()
        .take(3)
        .map(|entry| {
            if entry.folder.is_empty() {
                entry.assistant.as_str()
            } else {
                entry.folder.as_str()
            }
        })
        .collect();
    let more = missed.len().saturating_sub(names.len());
    let more = if more == 0 {
        String::new()
    } else {
        format!(" and {more} more")
    };
    format!(
        "Welcome back. {} chats spoke while you were away: {}{more}.",
        missed.len(),
        names.join(", ")
    )
}
