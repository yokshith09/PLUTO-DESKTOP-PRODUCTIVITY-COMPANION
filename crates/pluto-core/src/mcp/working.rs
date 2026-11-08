//! Long-running assistant chats that should reassure the person (A-7).

use crate::mcp::clean_bubble;

const FIRST_NOTICE_MS: i64 = 25 * 60 * 1_000;
const SECOND_NOTICE_MS: i64 = 60 * 60 * 1_000;
const EXPIRE_MS: i64 = 3 * 60 * 60 * 1_000;
const MAX_RUNS: usize = 20;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Notice {
    pub assistant: String,
    pub folder: String,
    pub minutes: u32,
}

impl Notice {
    pub fn text(&self) -> Option<String> {
        let folder = if self.folder.is_empty() {
            String::new()
        } else {
            format!(" · {}", self.folder)
        };
        clean_bubble(&format!(
            "{} has been working {} min{folder}",
            self.assistant, self.minutes
        ))
        .ok()
    }
}

#[derive(Debug)]
struct Run {
    assistant: String,
    folder: String,
    started_at_ms: i64,
    first_announced: bool,
    second_announced: bool,
}

#[derive(Debug, Default)]
pub struct Working {
    runs: Vec<Run>,
}

impl Working {
    /// Starts a fresh run for this assistant and folder, replacing any earlier run for the chat.
    pub fn start(&mut self, assistant: String, folder: String, now_ms: i64) {
        self.runs
            .retain(|run| run.assistant != assistant || run.folder != folder);
        if self.runs.len() == MAX_RUNS {
            self.runs.remove(0);
        }
        self.runs.push(Run {
            assistant,
            folder,
            started_at_ms: now_ms,
            first_announced: false,
            second_announced: false,
        });
    }

    /// Ends this chat's current run.
    pub fn end(&mut self, assistant: &str, folder: &str) -> bool {
        let before = self.runs.len();
        self.runs
            .retain(|run| run.assistant != assistant || run.folder != folder);
        self.runs.len() != before
    }

    /// Notices due at this moment, each returned once. Old runs disappear silently.
    pub fn due(&mut self, now_ms: i64) -> Vec<Notice> {
        self.runs
            .retain(|run| now_ms.saturating_sub(run.started_at_ms) <= EXPIRE_MS);
        let mut notices = Vec::new();
        for run in &mut self.runs {
            let elapsed = now_ms.saturating_sub(run.started_at_ms);
            if elapsed >= FIRST_NOTICE_MS && !run.first_announced {
                run.first_announced = true;
                notices.push(Notice {
                    assistant: run.assistant.clone(),
                    folder: run.folder.clone(),
                    minutes: 25,
                });
            }
            if elapsed >= SECOND_NOTICE_MS && !run.second_announced {
                run.second_announced = true;
                notices.push(Notice {
                    assistant: run.assistant.clone(),
                    folder: run.folder.clone(),
                    minutes: 60,
                });
            }
        }
        notices
    }

    /// The shell only needs its one-minute timer while a chat is still running.
    pub fn should_tick(&self) -> bool {
        !self.runs.is_empty()
    }

    #[cfg(test)]
    pub(crate) fn len(&self) -> usize {
        self.runs.len()
    }
}
