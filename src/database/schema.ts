export const APPLICATION_ID = 0x46464c57;
export const SCHEMA_VERSION = 12;
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
  { version: 6, sql: `CREATE TABLE ticket_dependencies (
      ticket_id TEXT NOT NULL REFERENCES project_tickets(id),
      prerequisite_id TEXT NOT NULL REFERENCES project_tickets(id),
      PRIMARY KEY(ticket_id,prerequisite_id), CHECK(ticket_id!=prerequisite_id)
    );
    CREATE TRIGGER ticket_dependencies_insert BEFORE INSERT ON ticket_dependencies BEGIN
      SELECT RAISE(ABORT,'Prerequisites must belong to the same project.')
      WHERE (SELECT m.project_id FROM project_tickets t JOIN milestones m ON m.id=t.milestone_id WHERE t.id=NEW.ticket_id)
        != (SELECT m.project_id FROM project_tickets t JOIN milestones m ON m.id=t.milestone_id WHERE t.id=NEW.prerequisite_id);
      SELECT RAISE(ABORT,'Prerequisites cannot form a cycle.') WHERE EXISTS (
        WITH RECURSIVE reached(id) AS (
          SELECT NEW.prerequisite_id UNION
          SELECT d.prerequisite_id FROM ticket_dependencies d JOIN reached r ON d.ticket_id=r.id
        ) SELECT 1 FROM reached WHERE id=NEW.ticket_id
      );
    END;
    CREATE TRIGGER ticket_dependencies_update BEFORE UPDATE ON ticket_dependencies BEGIN
      SELECT RAISE(ABORT,'Replace prerequisite links instead of updating them.');
    END;` },
  // Preserve the published draft-storage format before changing ticket states.
  { version: 7, sql: `CREATE TABLE plan_drafts (
      project_id TEXT PRIMARY KEY REFERENCES projects(id),
      draft_json TEXT NOT NULL CHECK(json_valid(draft_json))
    );` },
  { version: 8, sql: `CREATE TABLE next_project_tickets (
      id TEXT PRIMARY KEY, milestone_id TEXT NOT NULL REFERENCES milestones(id),
      title TEXT NOT NULL, description TEXT NOT NULL, acceptance_criteria TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('backlog','in_progress','review','done')),
      execution_mode TEXT NOT NULL CHECK(execution_mode='manual'),
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      block_reason TEXT NOT NULL DEFAULT '' CHECK(length(block_reason)<=1000)
    );
    INSERT INTO next_project_tickets
      SELECT id,milestone_id,title,description,acceptance_criteria,
        CASE WHEN status IN ('ready','blocked') THEN 'backlog' ELSE status END,
        execution_mode,created_at,updated_at,
        CASE WHEN status='blocked' THEN 'Previously marked Blocked. Explain or clear this blocker when the work can continue.' ELSE '' END
      FROM project_tickets ORDER BY rowid;
    CREATE TEMP TABLE retained_ticket_dependencies AS SELECT ticket_id,prerequisite_id FROM ticket_dependencies;
    DROP TABLE ticket_dependencies;
    DROP TABLE project_tickets;
    ALTER TABLE next_project_tickets RENAME TO project_tickets;
    CREATE INDEX project_tickets_milestone ON project_tickets(milestone_id);
    CREATE TABLE ticket_dependencies (
      ticket_id TEXT NOT NULL REFERENCES project_tickets(id),
      prerequisite_id TEXT NOT NULL REFERENCES project_tickets(id),
      PRIMARY KEY(ticket_id,prerequisite_id), CHECK(ticket_id!=prerequisite_id)
    );
    CREATE TRIGGER ticket_dependencies_insert BEFORE INSERT ON ticket_dependencies BEGIN
      SELECT RAISE(ABORT,'Prerequisites must belong to the same project.')
      WHERE (SELECT m.project_id FROM project_tickets t JOIN milestones m ON m.id=t.milestone_id WHERE t.id=NEW.ticket_id)
        != (SELECT m.project_id FROM project_tickets t JOIN milestones m ON m.id=t.milestone_id WHERE t.id=NEW.prerequisite_id);
      SELECT RAISE(ABORT,'Prerequisites cannot form a cycle.') WHERE EXISTS (
        WITH RECURSIVE reached(id) AS (
          SELECT NEW.prerequisite_id UNION
          SELECT d.prerequisite_id FROM ticket_dependencies d JOIN reached r ON d.ticket_id=r.id
        ) SELECT 1 FROM reached WHERE id=NEW.ticket_id
      );
    END;
    CREATE TRIGGER ticket_dependencies_update BEFORE UPDATE ON ticket_dependencies BEGIN
      SELECT RAISE(ABORT,'Replace prerequisite links instead of updating them.');
    END;
    INSERT INTO ticket_dependencies SELECT ticket_id,prerequisite_id FROM retained_ticket_dependencies;
    DROP TABLE retained_ticket_dependencies;` },
  { version: 9, sql: `CREATE TABLE coding_tickets (
      ticket_id TEXT PRIMARY KEY REFERENCES project_tickets(id),
      repository_json TEXT CHECK(repository_json IS NULL OR json_valid(repository_json)),
      issue_number INTEGER CHECK(issue_number IS NULL OR (typeof(issue_number)='integer' AND issue_number>0)),
      CHECK(issue_number IS NULL OR repository_json IS NOT NULL)
    );
    CREATE UNIQUE INDEX coding_issue_identity ON coding_tickets(json_extract(repository_json,'$.id'),issue_number)
      WHERE issue_number IS NOT NULL;` },
  { version: 10, sql: `CREATE TABLE plan_approvals (
      draft_id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id),
      approved_plan_json TEXT NOT NULL CHECK(json_valid(approved_plan_json)),
      receipt_json TEXT NOT NULL CHECK(json_valid(receipt_json))
    );` },
  { version: 11, sql: `CREATE TABLE publication_batches (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id),
      repository_json TEXT NOT NULL CHECK(json_valid(repository_json)), approved_at TEXT
    );
    CREATE TABLE issue_publications (
      ticket_id TEXT PRIMARY KEY REFERENCES project_tickets(id), batch_id TEXT NOT NULL REFERENCES publication_batches(id),
      content_json TEXT NOT NULL CHECK(json_valid(content_json)),
      stage TEXT NOT NULL CHECK(stage IN ('pending','creating','uncertain','linked','published','conflict')),
      issue_number INTEGER CHECK(issue_number IS NULL OR (typeof(issue_number)='integer' AND issue_number>0)),
      message TEXT NOT NULL DEFAULT ''
    );` },
  { version: 12, sql: `CREATE TABLE linked_work (
      ticket_id TEXT PRIMARY KEY REFERENCES coding_tickets(ticket_id),
      remote_issue_json TEXT CHECK(remote_issue_json IS NULL OR json_valid(remote_issue_json)),
      remote_pull_json TEXT CHECK(remote_pull_json IS NULL OR json_valid(remote_pull_json)),
      pr_number INTEGER CHECK(pr_number IS NULL OR (typeof(pr_number)='integer' AND pr_number>0)),
      last_success TEXT, last_error TEXT NOT NULL DEFAULT '',
      base_fields_json TEXT CHECK(base_fields_json IS NULL OR json_valid(base_fields_json))
    );` },
] as const;
