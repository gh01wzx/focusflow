import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { migrateDatabase, NewerDatabaseError } from './migrate.ts';
import { schemaVersion } from './backup.ts';
import { APPLICATION_ID, SCHEMA_VERSION, MIGRATIONS } from './schema.ts';

export async function openDatabase(path: string): Promise<DatabaseSync> {
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  try {
    const version = schemaVersion(db);
    const applicationId = db.prepare('PRAGMA application_id').get()?.application_id;
    const nonempty = db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().length > 0;
    if ((version > 0 || nonempty) && applicationId !== APPLICATION_ID) throw new Error('UNRECOGNIZED_PRODUCT_DATABASE');
    if (version > SCHEMA_VERSION) throw new NewerDatabaseError();
    if (version === 0 && (nonempty || (applicationId !== 0 && applicationId !== APPLICATION_ID))) throw new Error('UNRECOGNIZED_PRODUCT_DATABASE');
    if (version > 0 && db.prepare('SELECT format FROM tracker_meta').get()?.format !== 'focusflow-tasks') throw new Error('UNRECOGNIZED_PRODUCT_DATABASE');
    db.exec('PRAGMA busy_timeout=3000; PRAGMA foreign_keys=ON;');
    await migrateDatabase(db, path, MIGRATIONS);
    db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;');
  } catch (error) { db.close(); throw error; }

  return db;
}

export function inTransaction<T>(db: DatabaseSync, operation: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = operation();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    if (db.isTransaction) db.exec('ROLLBACK');
    throw error;
  }
}
