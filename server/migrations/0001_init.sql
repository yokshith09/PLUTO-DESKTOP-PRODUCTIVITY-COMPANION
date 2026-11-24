-- Pluto's counting server: everything it stores. No IP addresses, no content from the app.

-- One row per install. id_hash is HMAC(ID_KEY, the install's random number): the raw number is
-- never stored. first_hour (UTC, to the hour) shows bursts of new installs on the dashboard.
CREATE TABLE IF NOT EXISTS installs (
  id_hash    TEXT PRIMARY KEY,
  first_seen TEXT NOT NULL,   -- YYYY-MM-DD (UTC)
  first_hour TEXT NOT NULL,   -- YYYY-MM-DDTHH (UTC)
  last_seen  TEXT NOT NULL,   -- YYYY-MM-DD (UTC)
  os         TEXT NOT NULL,   -- windows | macos | linux
  version    TEXT NOT NULL    -- the app version, e.g. 0.6.1
);
CREATE INDEX IF NOT EXISTS installs_first_seen ON installs (first_seen);
CREATE INDEX IF NOT EXISTS installs_last_seen ON installs (last_seen);

-- Which installs were open on which day. Kept 35 days, then folded into daily_totals.
CREATE TABLE IF NOT EXISTS daily_active (
  day     TEXT NOT NULL,
  id_hash TEXT NOT NULL,
  PRIMARY KEY (day, id_hash)
) WITHOUT ROWID;

-- Older days: only the number of installs that were open.
CREATE TABLE IF NOT EXISTS daily_totals (
  day    TEXT PRIMARY KEY,
  active INTEGER NOT NULL
);

-- Website Download clicks per day and OS.
CREATE TABLE IF NOT EXISTS downloads (
  day   TEXT NOT NULL,
  os    TEXT NOT NULL,       -- windows | macos
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, os)
) WITHOUT ROWID;
