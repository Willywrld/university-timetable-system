-- ===========================================================================
-- University Timetable Scheduling System - SQLite schema
-- All tables use INTEGER PRIMARY KEY (rowid alias), explicit foreign keys and
-- indexes on the columns used by filters and conflict detection.
-- ===========================================================================
PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------------
-- Users and role based access
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT    NOT NULL UNIQUE,
  full_name     TEXT    NOT NULL,
  email         TEXT,
  password_hash TEXT    NOT NULL,
  role          TEXT    NOT NULL CHECK (role IN ('admin', 'timetable_officer', 'viewer')),
  active        INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT
);
CREATE INDEX IF NOT EXISTS idx_users_role ON users (role);

-- ---------------------------------------------------------------------------
-- Reference / master data
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS programmes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL UNIQUE,
  code       TEXT    NOT NULL UNIQUE,
  active     INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS levels (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  level_number INTEGER NOT NULL UNIQUE,
  active       INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS courses (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  course_code   TEXT    NOT NULL UNIQUE,
  course_title  TEXT    NOT NULL,
  programme_id  INTEGER NOT NULL REFERENCES programmes (id),
  level_id      INTEGER NOT NULL REFERENCES levels (id),
  is_ges        INTEGER NOT NULL DEFAULT 0 CHECK (is_ges IN (0, 1)),
  active        INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_courses_programme ON courses (programme_id);
CREATE INDEX IF NOT EXISTS idx_courses_level ON courses (level_id);

CREATE TABLE IF NOT EXISTS student_groups (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT    NOT NULL UNIQUE,
  programme_id INTEGER REFERENCES programmes (id),
  level_id     INTEGER REFERENCES levels (id),
  size         INTEGER,
  created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_groups_programme ON student_groups (programme_id);
CREATE INDEX IF NOT EXISTS idx_groups_level ON student_groups (level_id);

CREATE TABLE IF NOT EXISTS course_student_groups (
  course_id        INTEGER NOT NULL REFERENCES courses (id) ON DELETE CASCADE,
  student_group_id INTEGER NOT NULL REFERENCES student_groups (id) ON DELETE CASCADE,
  PRIMARY KEY (course_id, student_group_id)
);

CREATE TABLE IF NOT EXISTS facilitators (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL,
  email      TEXT    UNIQUE,
  active     INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS venues (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL UNIQUE,
  centre     TEXT    NOT NULL,
  capacity   INTEGER NOT NULL CHECK (capacity > 0),
  active     INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_venues_centre ON venues (centre);

CREATE TABLE IF NOT EXISTS platforms (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL UNIQUE,
  active     INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS timetable_types (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  code        TEXT NOT NULL UNIQUE CHECK (code IN ('physical', 'virtual', 'examination')),
  name        TEXT NOT NULL,
  description TEXT
);

CREATE TABLE IF NOT EXISTS time_slots (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  date       TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time   TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (date, start_time, end_time)
);
CREATE INDEX IF NOT EXISTS idx_slots_date ON time_slots (date);

-- ---------------------------------------------------------------------------
-- Timetable activities (a row is either a request to be scheduled or a
-- scheduled activity). status: unscheduled | scheduled | unassigned
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS assignments (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  timetable_type_id  INTEGER NOT NULL REFERENCES timetable_types (id),
  course_id          INTEGER NOT NULL REFERENCES courses (id),
  facilitator_id     INTEGER REFERENCES facilitators (id),
  venue_id           INTEGER REFERENCES venues (id),
  platform_id        INTEGER REFERENCES platforms (id),
  student_group_id   INTEGER REFERENCES student_groups (id),
  date               TEXT,
  start_time         TEXT,
  end_time           TEXT,
  expected_candidates INTEGER,
  exam_format        TEXT,
  centre             TEXT,
  duration_minutes   INTEGER NOT NULL DEFAULT 120,
  status             TEXT NOT NULL DEFAULT 'unscheduled'
                     CHECK (status IN ('unscheduled', 'scheduled', 'unassigned')),
  unassigned_reason  TEXT,
  created_by         INTEGER REFERENCES users (id),
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at         TEXT
);
CREATE INDEX IF NOT EXISTS idx_assignments_type ON assignments (timetable_type_id);
CREATE INDEX IF NOT EXISTS idx_assignments_course ON assignments (course_id);
CREATE INDEX IF NOT EXISTS idx_assignments_date ON assignments (date);
CREATE INDEX IF NOT EXISTS idx_assignments_venue ON assignments (venue_id);
CREATE INDEX IF NOT EXISTS idx_assignments_facilitator ON assignments (facilitator_id);
CREATE INDEX IF NOT EXISTS idx_assignments_group ON assignments (student_group_id);
CREATE INDEX IF NOT EXISTS idx_assignments_status ON assignments (status);

-- ---------------------------------------------------------------------------
-- Conflicts found by the conflict detection service
-- related_assignment_ids stores a JSON array of the other affected rows.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS conflicts (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  assignment_id          INTEGER NOT NULL REFERENCES assignments (id) ON DELETE CASCADE,
  related_assignment_ids TEXT,
  conflict_type          TEXT NOT NULL,
  severity               TEXT NOT NULL CHECK (severity IN ('hard', 'warning')),
  message                TEXT NOT NULL,
  suggested_fix          TEXT,
  detected_at            TEXT NOT NULL DEFAULT (datetime('now')),
  resolved               INTEGER NOT NULL DEFAULT 0 CHECK (resolved IN (0, 1)),
  resolved_by            INTEGER REFERENCES users (id),
  resolved_at            TEXT
);
CREATE INDEX IF NOT EXISTS idx_conflicts_assignment ON conflicts (assignment_id);
CREATE INDEX IF NOT EXISTS idx_conflicts_open ON conflicts (resolved);
CREATE INDEX IF NOT EXISTS idx_conflicts_type ON conflicts (conflict_type);

-- ---------------------------------------------------------------------------
-- Audit trail
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER REFERENCES users (id),
  action     TEXT NOT NULL,
  entity     TEXT NOT NULL,
  entity_id  INTEGER,
  details    TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log (user_id);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log (entity, entity_id);

-- ---------------------------------------------------------------------------
-- One row per automatic generation run (shown on the dashboard)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS generation_runs (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  timetable_type_id INTEGER NOT NULL REFERENCES timetable_types (id),
  requested_by      INTEGER REFERENCES users (id),
  date_from         TEXT,
  date_to           TEXT,
  assigned_count    INTEGER NOT NULL DEFAULT 0,
  unassigned_count  INTEGER NOT NULL DEFAULT 0,
  conflict_count    INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
