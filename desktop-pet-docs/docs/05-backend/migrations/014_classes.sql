-- 014: the timetable (Study › Timetable). A class sits on one weekday between two minutes of the day,
-- repeats every week, on odd or even weeks, or happens once. Deleting a course keeps its classes
-- (they fall back to the title saved with them). remind_min is read by the class reminder.
-- The runner owns the transaction and user_version.

CREATE TABLE classes (
    id         TEXT PRIMARY KEY,
    course_id  TEXT REFERENCES courses(id) ON DELETE SET NULL,
    title      TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 80),
    day        INTEGER NOT NULL CHECK (day BETWEEN 0 AND 6),
    start_min  INTEGER NOT NULL CHECK (start_min BETWEEN 0 AND 1439),
    end_min    INTEGER NOT NULL CHECK (end_min BETWEEN 1 AND 1440),
    place      TEXT NOT NULL DEFAULT '' CHECK (length(place) <= 40),
    teacher    TEXT NOT NULL DEFAULT '' CHECK (length(teacher) <= 40),
    repeat     TEXT NOT NULL DEFAULT 'weekly' CHECK (repeat IN ('weekly','odd','even','once')),
    once_date  TEXT CHECK (once_date IS NULL OR once_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
    remind_min INTEGER CHECK (remind_min IS NULL OR remind_min IN (10, 30)),
    created_at INTEGER NOT NULL,
    CHECK (end_min > start_min),
    CHECK ((repeat = 'once') = (once_date IS NOT NULL))
) STRICT;
CREATE INDEX idx_classes_day ON classes (day, start_min);
