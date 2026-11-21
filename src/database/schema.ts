export const APPLICATION_ID = 0x46464c57;
export const SCHEMA_VERSION = 32;
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
  { version: 13, sql: `CREATE TABLE coding_workspaces (
      ticket_id TEXT PRIMARY KEY REFERENCES coding_tickets(ticket_id),
      workspace_json TEXT NOT NULL CHECK(json_valid(workspace_json))
    );` },
  { version: 14, sql: `CREATE TABLE coding_runs (
      id TEXT PRIMARY KEY, ticket_id TEXT NOT NULL REFERENCES coding_tickets(ticket_id),
      stage TEXT NOT NULL, run_json TEXT NOT NULL CHECK(json_valid(run_json))
    );
    CREATE UNIQUE INDEX coding_single_active ON coding_runs((1))
      WHERE stage IN ('starting','coding','permission','cancelling','publishing','uncertain');` },
  { version:15,sql:`CREATE TABLE coding_deliveries (
      ticket_id TEXT PRIMARY KEY REFERENCES coding_tickets(ticket_id),delivery_json TEXT NOT NULL CHECK(json_valid(delivery_json))
    );` },
  {version:16,sql:`CREATE TABLE coding_reviews (
      ticket_id TEXT PRIMARY KEY REFERENCES coding_tickets(ticket_id),review_json TEXT NOT NULL CHECK(json_valid(review_json))
    );`},
  { version: 17, sql: `
    CREATE TABLE personal_scoring (
      subject TEXT PRIMARY KEY, mode TEXT NOT NULL CHECK(mode IN ('minutes','complete')),
      rate INTEGER NOT NULL CHECK(rate>=0), target INTEGER NOT NULL, cue TEXT NOT NULL
    );
    CREATE TABLE personal_rewards (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, cost INTEGER NOT NULL CHECK(cost>0),
      note TEXT NOT NULL, once_only INTEGER NOT NULL, archived INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE personal_entries (
      id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('earn','redeem','reverse','edit')),
      subject TEXT NOT NULL, title TEXT NOT NULL, day TEXT NOT NULL, logged_at TEXT NOT NULL,
      time_zone TEXT NOT NULL, offset_minutes INTEGER NOT NULL, minutes INTEGER NOT NULL,
      rate INTEGER NOT NULL, amount INTEGER NOT NULL, reference TEXT REFERENCES personal_entries(id)
    );
    CREATE INDEX personal_entries_subject ON personal_entries(subject,day);
    CREATE UNIQUE INDEX personal_reverse_once ON personal_entries(reference) WHERE kind='reverse';
    CREATE TABLE personal_preferences (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  ` },
  { version: 18, sql: `CREATE TABLE project_settings (
    project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
    settings_json TEXT NOT NULL CHECK(json_valid(settings_json))
  );` },
  { version: 19, sql: `CREATE TABLE ticket_ai (
    ticket_id TEXT PRIMARY KEY REFERENCES project_tickets(id) ON DELETE CASCADE,
    draft_json TEXT NOT NULL CHECK(json_valid(draft_json))
  );` },
  { version: 20, sql: `CREATE TABLE personal_date_corrections (
    operation_id TEXT PRIMARY KEY REFERENCES personal_entries(id),
    previous_day TEXT NOT NULL, previous_subject TEXT NOT NULL
  );
  CREATE TABLE ticket_previews (
    ticket_id TEXT PRIMARY KEY REFERENCES project_tickets(id) ON DELETE CASCADE,
    receipt_json TEXT NOT NULL CHECK(json_valid(receipt_json))
  );` },
  // Habit plan fields: identity, implementation intention (time and place),
  // two-minute starting version and a paired activity. Existing rules keep empty values.
  { version: 21, sql: `ALTER TABLE personal_scoring ADD COLUMN identity TEXT NOT NULL DEFAULT '';
    ALTER TABLE personal_scoring ADD COLUMN plan_time TEXT NOT NULL DEFAULT '';
    ALTER TABLE personal_scoring ADD COLUMN place TEXT NOT NULL DEFAULT '';
    ALTER TABLE personal_scoring ADD COLUMN starter TEXT NOT NULL DEFAULT '';
    ALTER TABLE personal_scoring ADD COLUMN bundle TEXT NOT NULL DEFAULT '';` },
  // Up to three one-off tasks chosen as the focus for a local day.
  { version: 22, sql: `CREATE TABLE day_focus (
    day TEXT NOT NULL,
    task_id TEXT NOT NULL REFERENCES tasks(id),
    position INTEGER NOT NULL CHECK(position BETWEEN 0 AND 2),
    PRIMARY KEY(day, task_id),
    UNIQUE(day, position)
  );` },
  // Older schedules all appeared as habits. The owner can correct their category in Edit plan.
  { version: 23, sql: "ALTER TABLE recurrence_rules ADD COLUMN category TEXT NOT NULL DEFAULT 'habit' CHECK(category IN ('task','habit'));" },
  { version: 24, sql: `CREATE TABLE task_exceptions (
    task_id TEXT PRIMARY KEY REFERENCES tasks(id) ON DELETE CASCADE,
    removed INTEGER NOT NULL DEFAULT 0 CHECK(removed IN (0,1)),
    frequency TEXT CHECK(frequency IN ('daily','weekly')),
    period_frequency TEXT CHECK(period_frequency IN ('daily','weekly'))
  );
  CREATE VIEW visible_tasks AS SELECT t.* FROM tasks t WHERE NOT EXISTS
    (SELECT 1 FROM task_exceptions x WHERE x.task_id=t.id AND x.removed=1);` },
  { version: 25, sql: 'ALTER TABLE recurrence_rules ADD COLUMN removed INTEGER NOT NULL DEFAULT 0 CHECK(removed IN (0,1));' },
  { version: 26, sql: `ALTER TABLE personal_scoring ADD COLUMN unit TEXT NOT NULL DEFAULT 'minutes' CHECK(unit IN ('minutes','count'));
    ALTER TABLE personal_entries ADD COLUMN unit TEXT NOT NULL DEFAULT 'minutes' CHECK(unit IN ('minutes','count'));` },
  // Repeating tasks can also repeat monthly, quarterly or yearly; habits stay daily or weekly.
  // SQLite cannot widen a CHECK in place, so both tables are rebuilt with their rows kept.
  // Tasks keep pointing at their schedules: foreign key checks wait until the end of this
  // transaction, when every schedule is back under the same id.
  { version: 27, sql: `PRAGMA defer_foreign_keys=ON;
    CREATE TEMP TABLE retained_rules AS SELECT id,title,frequency,start_date,next_date,created_at,stopped_at,weekdays_mask,category,removed FROM recurrence_rules;
    DROP TABLE recurrence_rules;
    CREATE TABLE recurrence_rules (
      id TEXT PRIMARY KEY, title TEXT NOT NULL,
      frequency TEXT NOT NULL CHECK(frequency IN ('daily','weekly','monthly','quarterly','yearly')),
      start_date TEXT NOT NULL, next_date TEXT, created_at TEXT NOT NULL, stopped_at TEXT,
      weekdays_mask INTEGER CHECK(weekdays_mask IS NULL OR (frequency='weekly' AND typeof(weekdays_mask)='integer' AND weekdays_mask BETWEEN 1 AND 127)),
      category TEXT NOT NULL DEFAULT 'habit' CHECK(category IN ('task','habit')),
      removed INTEGER NOT NULL DEFAULT 0 CHECK(removed IN (0,1)),
      CHECK(category='task' OR frequency IN ('daily','weekly'))
    );
    INSERT INTO recurrence_rules(id,title,frequency,start_date,next_date,created_at,stopped_at,weekdays_mask,category,removed)
      SELECT id,title,frequency,start_date,next_date,created_at,stopped_at,weekdays_mask,category,removed FROM retained_rules;
    DROP TABLE retained_rules;
    DROP VIEW visible_tasks;
    CREATE TABLE next_task_exceptions (
      task_id TEXT PRIMARY KEY REFERENCES tasks(id) ON DELETE CASCADE,
      removed INTEGER NOT NULL DEFAULT 0 CHECK(removed IN (0,1)),
      frequency TEXT CHECK(frequency IN ('daily','weekly','monthly','quarterly','yearly')),
      period_frequency TEXT CHECK(period_frequency IN ('daily','weekly','monthly','quarterly','yearly'))
    );
    INSERT INTO next_task_exceptions(task_id,removed,frequency,period_frequency)
      SELECT task_id,removed,frequency,period_frequency FROM task_exceptions;
    DROP TABLE task_exceptions;
    ALTER TABLE next_task_exceptions RENAME TO task_exceptions;
    CREATE VIEW visible_tasks AS SELECT t.* FROM tasks t WHERE NOT EXISTS
      (SELECT 1 FROM task_exceptions x WHERE x.task_id=t.id AND x.removed=1);` },
  // A habit's check-in and maintain amounts on the way to its target. Null keeps the defaults,
  // so existing plans need no change.
  { version: 28, sql: `ALTER TABLE personal_scoring ADD COLUMN start_amount INTEGER CHECK(start_amount IS NULL OR start_amount BETWEEN 1 AND 1440);
    ALTER TABLE personal_scoring ADD COLUMN maintain_amount INTEGER CHECK(maintain_amount IS NULL OR maintain_amount BETWEEN 1 AND 1440);` },
  // Paused stretches of local days. Habit occurrences on these days count as rest days.
  { version: 29, sql: `CREATE TABLE habit_pauses (
    id TEXT PRIMARY KEY, start_date TEXT NOT NULL, end_date TEXT NOT NULL, created_at TEXT NOT NULL,
    CHECK(start_date <= end_date)
  );` },
  // Ideas without a date, planned later from the Someday list.
  { version: 30, sql: `CREATE TABLE someday_items (
    id TEXT PRIMARY KEY, title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 300), created_at TEXT NOT NULL
  );` },
  // Quarterly goals, and the goal each task or habit plan works toward.
  { version: 31, sql: `CREATE TABLE personal_goals (
    id TEXT PRIMARY KEY, title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 200),
    quarter TEXT NOT NULL CHECK(quarter GLOB '[0-9][0-9][0-9][0-9]-Q[1-4]'),
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','done','dropped')),
    created_at TEXT NOT NULL, reviewed_at TEXT
  );
  ALTER TABLE personal_scoring ADD COLUMN goal_id TEXT REFERENCES personal_goals(id);` },
  // A flexible weekly habit: a number of days in each seven-day period, any days.
  { version: 32, sql: 'ALTER TABLE personal_scoring ADD COLUMN times_per_week INTEGER CHECK(times_per_week IS NULL OR times_per_week BETWEEN 1 AND 7);' },
] as const;
