import type { DatabaseSync } from 'node:sqlite';

// Every table, row by row, so an export keeps all saved data even as the schema grows.
// Credentials live outside the database and are never part of it.
export function exportTables(db: DatabaseSync): Record<string, unknown[]> {
  const tables = db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all()
    .map(row => String(row.name));
  return Object.fromEntries(tables.map(name => [name, db.prepare(`SELECT * FROM "${name.replaceAll('"', '""')}"`).all()]));
}

// Spreadsheet-friendly views of Personal data: every task and occurrence, and the points log.
export function exportTaskRows(db: DatabaseSync): Record<string, unknown>[] {
  return db.prepare(`SELECT t.title, t.planned_date AS plannedDate, t.status, t.resolved_at AS resolvedAt,
      COALESCE(r.category, 'task') AS category, COALESCE(x.frequency, r.frequency, '') AS repeats
    FROM visible_tasks t LEFT JOIN recurrence_rules r ON r.id=t.recurrence_id LEFT JOIN task_exceptions x ON x.task_id=t.id
    ORDER BY t.planned_date, t.created_at`).all() as Record<string, unknown>[];
}

export function exportPointRows(db: DatabaseSync): Record<string, unknown>[] {
  return db.prepare(`SELECT day, logged_at AS loggedAt, kind, title, minutes AS amount, unit, rate / 100.0 AS pointsPerUnit, amount / 100.0 AS points
    FROM personal_entries ORDER BY logged_at, rowid`).all() as Record<string, unknown>[];
}

// Comma-separated values with a byte order mark, so spreadsheet apps read Chinese text correctly.
export function toCsv(rows: Record<string, unknown>[], columns: string[]): string {
  const cell = (value: unknown) => {
    const text = value === null || value === undefined ? '' : String(value);
    return /[",\r\n]/.test(text) ? '"' + text.replaceAll('"', '""') + '"' : text;
  };
  return '﻿' + [columns.join(','), ...rows.map(row => columns.map(column => cell(row[column])).join(','))].join('\r\n') + '\r\n';
}
