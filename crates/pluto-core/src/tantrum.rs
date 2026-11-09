//! Tab Tantrum (TT-1, FR-08; owner 2026-11-09: "the pet should keep reacting, and when the tab
//! count is down it comes back to its original position"). Pure rule, no OS: the shell reads the
//! tab count of the front browser window and asks what to do.
//!
//! While the count is over the limit the pet keeps having its tantrum, once every
//! [`REPEAT_MS`]. When the count is back at or below the limit, the pet calms down once and goes
//! back to where it was. An unreadable count (no browser in front) changes nothing; a focus
//! session or a hidden pet calms it down so it never nags.

pub const DEFAULT_LIMIT: u32 = 15;
pub const MIN_LIMIT: u32 = 5;
pub const MAX_LIMIT: u32 = 60;
/// How often the tantrum repeats while the tabs stay over the limit.
pub const REPEAT_MS: i64 = 20_000;

/// What the shell should do now.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Step {
    /// Nothing to do.
    Idle,
    /// Have a tantrum (the first time it also moves the pet aside); the count is for the words.
    Rage { count: u32, first: bool },
    /// Back to normal: the pet returns to its own spot.
    Calm,
}

#[derive(Debug, Default)]
pub struct Tracker {
    raging: bool,
    last_ms: i64,
}

pub fn clamp_limit(n: i64) -> u32 {
    n.clamp(i64::from(MIN_LIMIT), i64::from(MAX_LIMIT)) as u32
}

impl Tracker {
    /// `count`: tabs in the front browser window, `None` when it cannot be read right now.
    /// `quiet`: a focus session runs, or the pet is hidden, or the feature is off.
    pub fn step(&mut self, count: Option<u32>, limit: u32, now_ms: i64, quiet: bool) -> Step {
        if quiet {
            return self.calm();
        }
        match count {
            None => Step::Idle,
            Some(c) if c <= limit => self.calm(),
            Some(c) => {
                if self.raging && now_ms - self.last_ms < REPEAT_MS {
                    return Step::Idle;
                }
                let first = !self.raging;
                self.raging = true;
                self.last_ms = now_ms;
                Step::Rage { count: c, first }
            }
        }
    }

    fn calm(&mut self) -> Step {
        if std::mem::replace(&mut self.raging, false) {
            Step::Calm
        } else {
            Step::Idle
        }
    }
}

/// The words on the bubble.
pub fn line(count: u32) -> String {
    format!("Ugh, {count} tabs! Click to tidy up.")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn under_the_limit_nothing_happens() {
        let mut t = Tracker::default();
        assert_eq!(t.step(Some(15), 15, 0, false), Step::Idle);
        assert_eq!(t.step(Some(3), 15, 1, false), Step::Idle);
    }

    #[test]
    fn it_keeps_reacting_while_over_and_calms_once_when_the_count_drops() {
        let mut t = Tracker::default();
        assert_eq!(
            t.step(Some(19), 15, 0, false),
            Step::Rage {
                count: 19,
                first: true
            }
        );
        assert_eq!(
            t.step(Some(19), 15, 5_000, false),
            Step::Idle,
            "not again yet"
        );
        assert_eq!(
            t.step(Some(18), 15, 20_000, false),
            Step::Rage {
                count: 18,
                first: false
            }
        );
        assert_eq!(
            t.step(Some(16), 15, 40_000, false),
            Step::Rage {
                count: 16,
                first: false
            }
        );
        assert_eq!(
            t.step(Some(15), 15, 45_000, false),
            Step::Calm,
            "back to its spot"
        );
        assert_eq!(
            t.step(Some(14), 15, 50_000, false),
            Step::Idle,
            "calm only once"
        );
    }

    #[test]
    fn an_unreadable_count_changes_nothing() {
        let mut t = Tracker::default();
        t.step(Some(20), 15, 0, false);
        assert_eq!(t.step(None, 15, 100_000, false), Step::Idle);
        assert_eq!(
            t.step(Some(20), 15, 100_001, false),
            Step::Rage {
                count: 20,
                first: false
            }
        );
    }

    #[test]
    fn a_focus_session_or_a_hidden_pet_calms_it_and_it_starts_afresh_after() {
        let mut t = Tracker::default();
        t.step(Some(20), 15, 0, false);
        assert_eq!(t.step(Some(20), 15, 1, true), Step::Calm);
        assert_eq!(t.step(Some(20), 15, 2, true), Step::Idle);
        assert_eq!(
            t.step(Some(20), 15, 3, false),
            Step::Rage {
                count: 20,
                first: true
            }
        );
    }

    #[test]
    fn limits_stay_in_range_and_the_words_are_kind() {
        assert_eq!(clamp_limit(1), 5);
        assert_eq!(clamp_limit(500), 60);
        assert_eq!(clamp_limit(15), 15);
        assert_eq!(line(19), "Ugh, 19 tabs! Click to tidy up.");
    }
}
