-- 013: the Course page (owner design 2026-11-18). A course gets a subtitle, a colour (index into the
-- app palette) and an archived flag. A course holds topics > subtopics > short points; an exam gets a
-- time, a place and the topics it covers; a course has important dates (assignment, lab, quiz,
-- project). Deleting a course or a topic removes what is under it. The runner owns the transaction
-- and user_version.

ALTER TABLE courses ADD COLUMN subtitle TEXT NOT NULL DEFAULT '';
ALTER TABLE courses ADD COLUMN color    INTEGER NOT NULL DEFAULT 0;
ALTER TABLE courses ADD COLUMN archived INTEGER NOT NULL DEFAULT 0;

ALTER TABLE exams ADD COLUMN at_time TEXT NOT NULL DEFAULT '';
ALTER TABLE exams ADD COLUMN place   TEXT NOT NULL DEFAULT '';

CREATE TABLE topics (
    id         TEXT PRIMARY KEY,
    course_id  TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    title      TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 100),
    starred    INTEGER NOT NULL DEFAULT 0 CHECK (starred IN (0,1)),
    status     INTEGER NOT NULL DEFAULT 0 CHECK (status BETWEEN 0 AND 3),
    position   INTEGER NOT NULL,
    created_at INTEGER NOT NULL
) STRICT;
CREATE INDEX idx_topics_course ON topics (course_id, position);

CREATE TABLE subtopics (
    id        TEXT PRIMARY KEY,
    topic_id  TEXT NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
    title     TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 100),
    done      INTEGER NOT NULL DEFAULT 0 CHECK (done IN (0,1)),
    position  INTEGER NOT NULL
) STRICT;
CREATE INDEX idx_subtopics_topic ON subtopics (topic_id, position);

CREATE TABLE points (
    id          TEXT PRIMARY KEY,
    subtopic_id TEXT NOT NULL REFERENCES subtopics(id) ON DELETE CASCADE,
    text        TEXT NOT NULL CHECK (length(text) BETWEEN 1 AND 300),
    written     INTEGER NOT NULL DEFAULT 0 CHECK (written IN (0,1)),
    position    INTEGER NOT NULL
) STRICT;
CREATE INDEX idx_points_subtopic ON points (subtopic_id, position);

CREATE TABLE exam_topics (
    exam_id  TEXT NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
    topic_id TEXT NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
    PRIMARY KEY (exam_id, topic_id)
) STRICT;

CREATE TABLE course_dates (
    id         TEXT PRIMARY KEY,
    course_id  TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    title      TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 100),
    on_date    TEXT NOT NULL CHECK (on_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
    kind       TEXT NOT NULL CHECK (kind IN ('assignment','lab','quiz','project','other')),
    created_at INTEGER NOT NULL
) STRICT;
CREATE INDEX idx_course_dates_course ON course_dates (course_id, on_date);
