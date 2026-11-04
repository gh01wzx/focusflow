import { DatabaseSync, backup } from 'node:sqlite';
import { constants } from 'node:fs';
import { access, copyFile, mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

export interface Snapshot {
  name: string;
  path: string;
  manifestPath: string;
  schemaVersion: number;
  sha256: string;
}

export function schemaVersion(db: DatabaseSync): number {
  const version = db.prepare('PRAGMA user_version').get()?.user_version;
  if (typeof version !== 'number' || !Number.isSafeInteger(version) || version < 0) throw new Error('INVALID_SCHEMA_VERSION');
  return version;
}

function checkIntegrity(db: DatabaseSync): void {
  const results = db.prepare('PRAGMA integrity_check').all();
  if (results.length !== 1 || results[0]?.integrity_check !== 'ok') throw new Error('DATABASE_INTEGRITY_FAILED');
}

async function digest(path: string): Promise<string> {
  return createHash('sha256').update(await readFile(path)).digest('hex');
}

export async function createSnapshot(source: DatabaseSync, directory: string, targetSchemaVersion?: number): Promise<Snapshot> {
  await mkdir(directory, { recursive: true });
  const prefix = targetSchemaVersion === undefined ? 'snapshot' : `before-migration-to-${targetSchemaVersion}`;
  const name = `${prefix}-${Date.now()}-${randomUUID()}.db`;
  const path = join(directory, name);
  await backup(source, path);
  const check = new DatabaseSync(path, { readOnly: true });
  let version: number;
  try { checkIntegrity(check); version = schemaVersion(check); } finally { check.close(); }
  const sha256 = await digest(path);
  const manifestPath = path + '.json';
  await writeFile(manifestPath, JSON.stringify({
    formatVersion: 1, databaseFile: name, schemaVersion: version, sha256,
    createdAt: new Date().toISOString(),
    ...(targetSchemaVersion === undefined ? {} : { targetSchemaVersion }),
  }, null, 2) + '\n', { flag: 'wx' });
  return { name, path, manifestPath, schemaVersion: version, sha256 };
}

export async function restoreSnapshot(source: string, destination: string): Promise<void> {
  const manifest: unknown = JSON.parse(await readFile(source + '.json', 'utf8'));
  if (typeof manifest !== 'object' || manifest === null
    || !('formatVersion' in manifest) || manifest.formatVersion !== 1
    || !('databaseFile' in manifest) || manifest.databaseFile !== basename(source)
    || !('schemaVersion' in manifest) || typeof manifest.schemaVersion !== 'number' || !Number.isSafeInteger(manifest.schemaVersion) || manifest.schemaVersion < 0
    || !('sha256' in manifest) || typeof manifest.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(manifest.sha256)) {
    throw new Error('INVALID_BACKUP_MANIFEST');
  }
  if (await digest(source) !== manifest.sha256) throw new Error('BACKUP_CHECKSUM_MISMATCH');
  const inspect = new DatabaseSync(source, { readOnly: true });
  try {
    checkIntegrity(inspect);
    if (schemaVersion(inspect) !== manifest.schemaVersion) throw new Error('BACKUP_SCHEMA_MISMATCH');
  } finally { inspect.close(); }
  for (const suffix of ['-wal', '-shm', '-journal']) {
    try { await access(destination + suffix); }
    catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') continue;
      throw error;
    }
    throw new Error('RESTORE_TARGET_HAS_SIDECARS');
  }
  await mkdir(dirname(destination), { recursive: true });
  // COPYFILE_EXCL refuses existing targets, including the live database itself.
  await copyFile(source, destination, constants.COPYFILE_EXCL);
  try {
    if (await digest(destination) !== manifest.sha256) throw new Error('RESTORE_CHECKSUM_MISMATCH');
  } catch (error) {
    // Only this exclusively created output is removed; source and existing data stay intact.
    await unlink(destination);
    throw error;
  }
}
