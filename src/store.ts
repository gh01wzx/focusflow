import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createSnapshot, schemaVersion } from './database/backup.ts';
import type { Snapshot } from './database/backup.ts';
import { migrateDatabase, NewerDatabaseError } from './database/migrate.ts';
import type { Migration } from './database/migrate.ts';

export const SCHEMA_VERSION = 2;
const migrations: readonly Migration[] = [
  { version: 1, sql: `CREATE TABLE probe_note (id INTEGER PRIMARY KEY CHECK(id=1), body TEXT NOT NULL);
    INSERT INTO probe_note VALUES(1, '');` },
  { version: 2, sql: `CREATE TABLE store_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    INSERT INTO store_metadata VALUES('format', 'focusflow-phase0');` },
];

export interface Store {
  read(): string;
  save(body: unknown): void;
  snapshot(directory: string): Promise<Snapshot>;
  close(): void;
}

export async function openStore(path: string): Promise<Store> {
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  try {
    const version = schemaVersion(db);
    // An older binary must never modify a newer schema, even its journal mode.
    if (version > SCHEMA_VERSION) throw new NewerDatabaseError();
    db.exec('PRAGMA busy_timeout=3000; PRAGMA foreign_keys=ON;');
    if (version === 0 && db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().length) throw new Error('UNRECOGNIZED_DATABASE');
    await migrateDatabase(db, path, migrations);
    db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;');
  } catch (error) {
    db.close();
    throw error;
  }
  return {
    read() {
      const body = db.prepare('SELECT body FROM probe_note WHERE id=1').get()?.body;
      if (typeof body !== 'string') throw new Error('INVALID_NOTE_DATA');
      return body;
    },
    save(body: unknown) {
      if (typeof body !== 'string' || body.length > 500) throw new TypeError('Enter test text with no more than 500 characters.');
      db.prepare('UPDATE probe_note SET body=? WHERE id=1').run(body);
    },
    snapshot: (directory: string) => createSnapshot(db, directory),
    close: () => db.close(),
  };
}
