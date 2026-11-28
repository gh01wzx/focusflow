import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { APPLICATION_ID, SCHEMA_VERSION } from './schema.ts';

// The task data is one SQLite file. An import waits beside it under another name until the next
// start, when nothing has the data open.
export const DATA_FILE = 'tracker.db';
export const IMPORT_FILE = 'tracker.db.import';

export class DataFileError extends Error {}

// Checks, without changing it, that a file is complete FocusFlow data this version can open.
export function inspectDataFile(path: string): void {
  let db: DatabaseSync | undefined;
  try {
    db = new DatabaseSync(path, { readOnly: true });
    const id = db.prepare('PRAGMA application_id').get()?.application_id;
    const version = db.prepare('PRAGMA user_version').get()?.user_version;
    if (id !== APPLICATION_ID || typeof version !== 'number' || version < 1) throw new DataFileError('This file is not FocusFlow data.');
    if (version > SCHEMA_VERSION) throw new DataFileError('This file belongs to a newer FocusFlow version.');
    const check = db.prepare('PRAGMA integrity_check').all();
    if (check.length !== 1 || check[0]?.integrity_check !== 'ok') throw new DataFileError('This file is damaged.');
  } catch (error) {
    throw error instanceof DataFileError ? error : new DataFileError('This file could not be opened as FocusFlow data.');
  } finally { db?.close(); }
}

// Moves the data file and any journal beside it into backups as replaced-<time>.db, so nothing is
// deleted when other data takes its place.
export function setAside(directory: string): void {
  const backups = join(directory, 'backups');
  mkdirSync(backups, { recursive: true });
  const name = 'replaced-' + Date.now() + '.db';
  for (const suffix of ['', '-wal', '-shm', '-journal']) {
    const from = join(directory, DATA_FILE + suffix);
    if (existsSync(from)) renameSync(from, join(backups, name + suffix));
  }
}

// Puts an import in place before the data opens. Returns whether there was one.
export function applyPendingImport(directory: string): boolean {
  const pending = join(directory, IMPORT_FILE);
  if (!existsSync(pending)) return false;
  setAside(directory);
  renameSync(pending, join(directory, DATA_FILE));
  return true;
}
