import { DatabaseSync } from 'node:sqlite';
import { dirname, join } from 'node:path';
import { createSnapshot, schemaVersion } from './backup.ts';
import type { Snapshot } from './backup.ts';

export interface Migration {
  version: number;
  sql: string;
}

export class NewerDatabaseError extends Error {
  constructor() {
    super('NEWER_DATABASE: use the newer application; no downgrade migration is available.');
    this.name = 'NewerDatabaseError';
  }
}

export class MigrationError extends Error {
  readonly snapshot: Snapshot | undefined;
  constructor(cause: unknown, snapshot: Snapshot | undefined) {
    super('DATABASE_MIGRATION_FAILED: the transaction was rolled back; retain the database and any pre-upgrade backup.', { cause });
    this.name = 'MigrationError';
    this.snapshot = snapshot;
  }
}

export async function migrateDatabase(db: DatabaseSync, path: string, migrations: readonly Migration[]): Promise<void> {
  if (!migrations.length || migrations.some((migration, index) => migration.version !== index + 1)) throw new Error('INVALID_MIGRATION_SEQUENCE');
  const target = migrations.length;
  const initial = schemaVersion(db);
  if (initial > target) throw new NewerDatabaseError();
  if (initial === target) return;
  db.exec('BEGIN IMMEDIATE');
  let snapshot: Snapshot | undefined;
  try {
    const from = schemaVersion(db);
    if (from > target) throw new NewerDatabaseError();
    if (from > 0 && from < target) {
      // The reserved writer lock prevents concurrent writes. A separate reader can
      // back up committed WAL data without backing up an active write transaction.
      const reader = new DatabaseSync(path, { readOnly: true });
      try {
        snapshot = await createSnapshot(reader, join(dirname(path), 'backups'), target);
        if (snapshot.schemaVersion !== from) throw new Error('BACKUP_SCHEMA_MISMATCH');
      } finally { reader.close(); }
    }
    for (const migration of migrations) {
      if (migration.version <= from) continue;
      db.exec(migration.sql);
      db.exec(`PRAGMA user_version=${migration.version}`);
    }
    const integrity = db.prepare('PRAGMA integrity_check').all();
    if (integrity.length !== 1 || integrity[0]?.integrity_check !== 'ok') throw new Error('MIGRATED_DATABASE_INTEGRITY_FAILED');
    db.exec('COMMIT');
  } catch (error) {
    if (db.isTransaction) db.exec('ROLLBACK');
    if (error instanceof NewerDatabaseError) throw error;
    throw new MigrationError(error, snapshot);
  }
}
