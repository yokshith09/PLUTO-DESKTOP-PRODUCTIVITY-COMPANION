//! At most [`CALLS_PER_MINUTE`] calls per tool per assistant in any 60 seconds (owner
//! 2026-10-31). Extra calls are refused, not queued.

use std::collections::{HashMap, VecDeque};
use std::sync::{Mutex, PoisonError};
use std::time::Duration;

use tokio::time::Instant;

/// Calls per tool per assistant in any minute.
pub const CALLS_PER_MINUTE: usize = 10;
const WINDOW: Duration = Duration::from_secs(60);

/// One assistant's counts, shared by all of its connections.
#[derive(Debug, Default)]
pub struct RateLimit {
    calls: Mutex<HashMap<&'static str, VecDeque<Instant>>>,
}

impl RateLimit {
    /// Counts the call and says whether it may go ahead.
    pub fn allow(&self, tool: &'static str) -> bool {
        let now = Instant::now();
        let mut calls = self.calls.lock().unwrap_or_else(PoisonError::into_inner);
        let recent = calls.entry(tool).or_default();
        while recent
            .front()
            .is_some_and(|t| now.duration_since(*t) >= WINDOW)
        {
            recent.pop_front();
        }
        if recent.len() >= CALLS_PER_MINUTE {
            return false;
        }
        recent.push_back(now);
        true
    }
}
