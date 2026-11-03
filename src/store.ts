import { DatabaseSync, backup } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';

export const SCHEMA_VERSION = 1;

export interface Snapshot {
  name: string;
  path: string;
}

export interface Store {
  read(): string;
  save(body: unknown): void;
  snapshot(directory: string): Promise<Snapshot>;
  close(): void;
}

export function openStore(path: string): Store {
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  try {
    const version = db.prepare('PRAGMA user_version').get()?.user_version;
    if (typeof version !== 'number') throw new Error('INVALID_SCHEMA_VERSION');
    // An older binary must never modify a newer schema, even its journal mode.
    if (version > SCHEMA_VERSION) throw new Error('NEWER_DATABASE: use the newer application; no downgrade migration is available.');
    db.exec('PRAGMA busy_timeout=3000; PRAGMA foreign_keys=ON;');
    if (version === 0) {
      db.exec(`BEGIN IMMEDIATE;
        CREATE TABLE probe_note (id INTEGER PRIMARY KEY CHECK(id=1), body TEXT NOT NULL);
        INSERT INTO probe_note VALUES(1, '');
        PRAGMA user_version=1;
        COMMIT;`);
    }
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
      if (typeof body !== 'string' || body.length > 500) throw new TypeError('请输入不超过 500 字的验证文字。');
      db.prepare('UPDATE probe_note SET body=? WHERE id=1').run(body);
    },
    async snapshot(directory: string) {
      mkdirSync(directory, { recursive: true });
      const name = `probe-${Date.now()}-${randomUUID()}.db`;
      const destination = join(directory, name);
      // SQLite backup includes committed WAL data; never copy only the live .db.
      await backup(db, destination);
      const check = new DatabaseSync(destination, { readOnly: true });
      try {
        if (check.prepare('PRAGMA integrity_check').get()?.integrity_check !== 'ok') throw new Error('BACKUP_INTEGRITY_FAILED');
      } finally { check.close(); }
      return { name, path: destination };
    },
    close: () => db.close(),
  };
}
