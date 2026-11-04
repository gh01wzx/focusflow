import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { migrateDatabase, NewerDatabaseError } from '../database/migrate.ts';
import { createSnapshot, schemaVersion } from '../database/backup.ts';
import { localDay, nextOccurrence, recurrenceInput, taskInput, TaskInputError } from './model.ts';
import type { Task, TaskView, RecurrenceRule } from './model.ts';

export const TASK_APPLICATION_ID = 0x46464c57;
export const TASK_SCHEMA_VERSION = 3;
// Schema 1 is an explicit synthetic prior product schema, not a historic release.
export const TASK_MIGRATIONS = [
  { version: 1, sql: `PRAGMA application_id=${TASK_APPLICATION_ID};
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
] as const;

export async function openTaskStore(path: string, clock: () => Date = () => new Date()) {
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  try {
    const version = schemaVersion(db);
    const applicationId = db.prepare('PRAGMA application_id').get()?.application_id;
    const nonempty = db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().length > 0;
    if ((version > 0 || nonempty) && applicationId !== TASK_APPLICATION_ID) throw new Error('UNRECOGNIZED_PRODUCT_DATABASE');
    if (version > TASK_SCHEMA_VERSION) throw new NewerDatabaseError();
    if (version === 0 && (nonempty || (applicationId !== 0 && applicationId !== TASK_APPLICATION_ID))) throw new Error('UNRECOGNIZED_PRODUCT_DATABASE');
    if (version > 0 && db.prepare('SELECT format FROM tracker_meta').get()?.format !== 'focusflow-tasks') throw new Error('UNRECOGNIZED_PRODUCT_DATABASE');
    db.exec('PRAGMA busy_timeout=3000; PRAGMA foreign_keys=ON;');
    await migrateDatabase(db, path, TASK_MIGRATIONS);
    db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;');
  } catch (error) { db.close(); throw error; }

  const taskColumns = `SELECT t.id,t.title,t.planned_date AS plannedDate,t.status,t.created_at AS createdAt,
    t.resolved_at AS resolvedAt,t.recurrence_id AS recurrenceId,r.frequency
    FROM tasks t LEFT JOIN recurrence_rules r ON r.id=t.recurrence_id`;
  const ruleColumns = `SELECT id,title,frequency,start_date AS startDate,next_date AS nextDate,
    created_at AS createdAt,stopped_at AS stoppedAt FROM recurrence_rules`;
  function readTask(id: string): Task | undefined {
    return db.prepare(taskColumns + ' WHERE t.id=?').get(id) as unknown as Task | undefined;
  }
  const insert = db.prepare('INSERT INTO tasks(id,title,planned_date,status,created_at,resolved_at,recurrence_id) VALUES(?,?,?,?,?,?,?)');

  function reconcile(now: Date) {
    const today = localDay(now);
    const timestamp = now.toISOString();
    const pending = db.prepare(taskColumns + " WHERE t.status='pending' AND t.recurrence_id IS NOT NULL").all() as unknown as Task[];
    for (const task of pending) {
      const end = nextOccurrence(task.plannedDate, task.frequency!);
      if (end !== null && end <= today) db.prepare("UPDATE tasks SET status='missed',resolved_at=? WHERE id=?").run(timestamp, task.id);
    }
    const rules = db.prepare(ruleColumns + ' WHERE stopped_at IS NULL AND next_date<=?').all(today) as unknown as RecurrenceRule[];
    for (const rule of rules) {
      let date = rule.nextDate;
      while (date !== null && date <= today) {
        const end = nextOccurrence(date, rule.frequency);
        const missed = end !== null && end <= today;
        insert.run(randomUUID(), rule.title, date, missed ? 'missed' : 'pending', timestamp, missed ? timestamp : null, rule.id);
        date = end;
      }
      db.prepare('UPDATE recurrence_rules SET next_date=? WHERE id=?').run(date, rule.id);
    }
  }

  // Reconciliation and the caller's change share one writer transaction. A crash
  // cannot advance a schedule without its occurrences, or partially expire a period.
  function transaction<T>(operation: (now: Date) => T): T {
    db.exec('BEGIN IMMEDIATE');
    try {
      const now = clock();
      reconcile(now);
      const result = operation(now);
      db.exec('COMMIT');
      return result;
    } catch (error) {
      if (db.isTransaction) db.exec('ROLLBACK');
      throw error;
    }
  }
  return {
    view: (): TaskView => transaction(now => {
      const today = localDay(now);
      const rows = db.prepare(taskColumns + ' ORDER BY t.planned_date,t.created_at,t.id').all() as unknown as Task[];
      return {
        today,
        due: rows.filter(task => task.status === 'pending' && task.plannedDate <= today),
        upcoming: rows.filter(task => task.status === 'pending' && task.plannedDate > today),
        history: rows.filter(task => task.status !== 'pending').sort((a, b) => (b.resolvedAt ?? '').localeCompare(a.resolvedAt ?? '') || b.plannedDate.localeCompare(a.plannedDate) || b.id.localeCompare(a.id)),
        recurrences: db.prepare(ruleColumns + ' WHERE stopped_at IS NULL ORDER BY created_at,id').all() as unknown as RecurrenceRule[],
      };
    }),
    add: (input: unknown): Task => transaction(now => {
      const { title, plannedDate } = taskInput(input);
      const id = randomUUID();
      insert.run(id, title, plannedDate, 'pending', now.toISOString(), null, null);
      return readTask(id)!;
    }),
    addRecurrence: (input: unknown): RecurrenceRule => transaction(now => {
      const { title, plannedDate, frequency } = recurrenceInput(input, localDay(now));
      const id = randomUUID();
      db.prepare('INSERT INTO recurrence_rules VALUES(?,?,?,?,?,?,NULL)').run(id, title, frequency, plannedDate, nextOccurrence(plannedDate, frequency), now.toISOString());
      insert.run(randomUUID(), title, plannedDate, 'pending', now.toISOString(), null, id);
      return db.prepare(ruleColumns + ' WHERE id=?').get(id) as unknown as RecurrenceRule;
    }),
    stopRecurrence: (id: string): RecurrenceRule | undefined => transaction(now => {
      const rule = db.prepare(ruleColumns + ' WHERE id=?').get(id) as unknown as RecurrenceRule | undefined;
      if (!rule) return undefined;
      db.prepare('UPDATE recurrence_rules SET stopped_at=? WHERE id=? AND stopped_at IS NULL').run(now.toISOString(), id);
      db.prepare("UPDATE tasks SET status='cancelled',resolved_at=? WHERE recurrence_id=? AND status='pending' AND planned_date>?").run(now.toISOString(), id, localDay(now));
      return db.prepare(ruleColumns + ' WHERE id=?').get(id) as unknown as RecurrenceRule;
    }),
    resolve: (id: string, status: unknown): Task | undefined => transaction(now => {
      if (status !== 'completed' && status !== 'cancelled') throw new TaskInputError('Choose complete or cancel.');
      const task = readTask(id);
      if (!task) return undefined;
      if (task.status !== 'pending' && task.status !== status) throw new TaskInputError('This task is already resolved. Refresh to see its current period.');
      db.prepare("UPDATE tasks SET status=?, resolved_at=? WHERE id=? AND status='pending'").run(status, now.toISOString(), id);
      return readTask(id);
    }),
    snapshot: () => { transaction(() => {}); return createSnapshot(db, join(dirname(path), 'backups')); },
    close: () => db.close(),
  };
}
