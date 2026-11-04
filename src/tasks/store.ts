import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { migrateDatabase, NewerDatabaseError } from '../database/migrate.ts';
import { createSnapshot, schemaVersion } from '../database/backup.ts';
import { localDay, taskInput, TaskInputError } from './model.ts';
import type { Task, TaskStatus, TaskView } from './model.ts';

export const TASK_APPLICATION_ID = 0x46464c57;
export const TASK_SCHEMA_VERSION = 2;
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

  function readTask(id: string): Task | undefined {
    const row = db.prepare('SELECT id,title,planned_date AS plannedDate,status,created_at AS createdAt,resolved_at AS resolvedAt FROM tasks WHERE id=?').get(id);
    return row as unknown as Task | undefined;
  }
  return {
    view(): TaskView {
      const today = localDay(clock());
      const rows = db.prepare('SELECT id,title,planned_date AS plannedDate,status,created_at AS createdAt,resolved_at AS resolvedAt FROM tasks ORDER BY planned_date,created_at,id').all() as unknown as Task[];
      return {
        today,
        due: rows.filter(task => task.status === 'pending' && task.plannedDate <= today),
        upcoming: rows.filter(task => task.status === 'pending' && task.plannedDate > today),
        history: rows.filter(task => task.status !== 'pending').sort((a, b) => (b.resolvedAt ?? '').localeCompare(a.resolvedAt ?? '') || b.id.localeCompare(a.id)),
      };
    },
    add(input: unknown): Task {
      const { title, plannedDate } = taskInput(input);
      const id = randomUUID();
      db.prepare("INSERT INTO tasks VALUES(?,?,?,'pending',?,NULL)").run(id, title, plannedDate, clock().toISOString());
      return readTask(id)!;
    },
    resolve(id: string, status: unknown): Task | undefined {
      if (status !== 'completed' && status !== 'cancelled') throw new TaskInputError('Choose complete or cancel.');
      const task = readTask(id);
      if (!task) return undefined;
      if (task.status !== 'pending' && task.status !== status) throw new TaskInputError('This task is already resolved.');
      db.prepare("UPDATE tasks SET status=?, resolved_at=? WHERE id=? AND status='pending'").run(status satisfies TaskStatus, clock().toISOString(), id);
      return readTask(id);
    },
    snapshot: () => createSnapshot(db, join(dirname(path), 'backups')),
    close: () => db.close(),
  };
}
