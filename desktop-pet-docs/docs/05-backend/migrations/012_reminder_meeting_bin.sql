-- 012: a Bin for reminders and meetings (owner 2026-11-01, Q4). Deleting one moves it here; it can
-- be restored for 30 days, then it is deleted for good (as notes and tasks).
-- The runner owns the transaction and user_version.

ALTER TABLE reminders ADD COLUMN binned_at INTEGER;
CREATE INDEX idx_reminders_binned ON reminders (binned_at) WHERE binned_at IS NOT NULL;
ALTER TABLE meetings ADD COLUMN binned_at INTEGER;
CREATE INDEX idx_meetings_binned ON meetings (binned_at) WHERE binned_at IS NOT NULL;
