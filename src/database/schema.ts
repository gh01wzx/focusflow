export const APPLICATION_ID = 0x46464c57;
export const SCHEMA_VERSION = 5;
// Schema 1 is an explicit synthetic prior product schema, not a historic release.
export const MIGRATIONS = [
  { version: 1, sql: `PRAGMA application_id=${APPLICATION_ID};
    CREATE TABLE tracker_meta (format TEXT NOT NULL);
    INSERT INTO tracker_meta VALUES('focusflow-tasks');
    CREATE TABLE tasks (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, planned_date TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('pending','completed','cancelled')),
      created_at TEXT NOT NULL, resolved_at TEXT,
      CHECK((status='pending' AND resolved_at IS NULL) OR (status!='pending' AND resolved_at IS NOT NULL))
    );` },
  { version: 2, sql: 'CREATE INDEX tasks_status_date ON tasks(status, planned_date, created_at);' },
  { version: 3, sql: `CREATE TABLE recurrence_rules (
      id TEXT PRIMARY KEY, title TEXT NOT NULL,
      frequency TEXT NOT NULL CHECK(frequency IN ('daily','weekly')),
      start_date TEXT NOT NULL, next_date TEXT, created_at TEXT NOT NULL, stopped_at TEXT
    );
    ALTER TABLE tasks RENAME TO previous_tasks;
    CREATE TABLE tasks (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, planned_date TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('pending','completed','cancelled','missed')),
      created_at TEXT NOT NULL, resolved_at TEXT,
      recurrence_id TEXT REFERENCES recurrence_rules(id),
      UNIQUE(recurrence_id, planned_date),
      CHECK(status!='missed' OR recurrence_id IS NOT NULL),
      CHECK((status='pending' AND resolved_at IS NULL) OR (status!='pending' AND resolved_at IS NOT NULL))
    );
    INSERT INTO tasks(id,title,planned_date,status,created_at,resolved_at)
      SELECT id,title,planned_date,status,created_at,resolved_at FROM previous_tasks;
    DROP TABLE previous_tasks;
    CREATE INDEX tasks_status_date ON tasks(status, planned_date, created_at);` },
  { version: 4, sql: `CREATE TABLE projects (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE milestones (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id),
      title TEXT NOT NULL, description TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE INDEX milestones_project ON milestones(project_id);
    CREATE TABLE project_tickets (
      id TEXT PRIMARY KEY, milestone_id TEXT NOT NULL REFERENCES milestones(id),
      title TEXT NOT NULL, description TEXT NOT NULL, acceptance_criteria TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('backlog','ready','in_progress','review','done','blocked')),
      execution_mode TEXT NOT NULL CHECK(execution_mode='manual'),
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE INDEX project_tickets_milestone ON project_tickets(milestone_id);` },
  { version: 5, sql: `ALTER TABLE recurrence_rules ADD COLUMN weekdays_mask INTEGER
      CHECK(weekdays_mask IS NULL OR (frequency='weekly' AND typeof(weekdays_mask)='integer' AND weekdays_mask BETWEEN 1 AND 127));` },
] as const;
