import test from 'node:test';
import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { access, appendFile, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openStore, SCHEMA_VERSION } from '../src/store.ts';
import { restoreSnapshot, schemaVersion } from '../src/database/backup.ts';
import { migrateDatabase, MigrationError } from '../src/database/migrate.ts';

async function fixture(t: TestContext) {
  const directory = await mkdtemp(join(tmpdir(), 'focusflow-migration-test-'));
  t.after(async () => {
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
    assert.ok(basename(directory).startsWith('focusflow-migration-test-'));
    await rm(directory, { recursive: true, force: true });
  });
  return { directory, path: join(directory, 'test.db') };
}

function legacyStore(path: string): DatabaseSync {
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA journal_mode=WAL;
    CREATE TABLE probe_note (id INTEGER PRIMARY KEY CHECK(id=1), body TEXT NOT NULL);
    INSERT INTO probe_note VALUES(1, 'retained legacy data');
    PRAGMA user_version=1;`);
  return db;
}

test('schema upgrade snapshots committed WAL data and is not repeated on reopen', async t => {
  const { directory, path } = await fixture(t);
  const legacy = legacyStore(path);
  try {
    const store = await openStore(path);
    try { assert.equal(store.read(), 'retained legacy data'); } finally { store.close(); }
    const files = await readdir(join(directory, 'backups'));
    const snapshotName = files.find(name => name.endsWith('.db'));
    assert.ok(snapshotName);
    const snapshot = join(directory, 'backups', snapshotName);
    const manifest: unknown = JSON.parse(await readFile(snapshot + '.json', 'utf8'));
    assert.ok(typeof manifest === 'object' && manifest !== null && 'targetSchemaVersion' in manifest);
    assert.equal(manifest.targetSchemaVersion, SCHEMA_VERSION);
    const recovery = join(directory, 'recovered.db');
    await restoreSnapshot(snapshot, recovery);
    const recovered = new DatabaseSync(recovery, { readOnly: true });
    try {
      assert.equal(schemaVersion(recovered), 1);
      assert.equal(recovered.prepare('SELECT body FROM probe_note').get()?.body, 'retained legacy data');
    } finally { recovered.close(); }
    const reopened = await openStore(path);
    try { assert.equal(reopened.read(), 'retained legacy data'); } finally { reopened.close(); }
    assert.deepEqual(await readdir(join(directory, 'backups')), files);
  } finally { legacy.close(); }
});

test('a migration failure rolls back schema and data while preserving a recoverable snapshot', async t => {
  const { directory, path } = await fixture(t);
  const db = legacyStore(path);
  try {
    let failure: unknown;
    try {
      await migrateDatabase(db, path, [
        { version: 1, sql: 'SELECT 1;' },
        { version: 2, sql: "UPDATE probe_note SET body='must roll back'; CREATE TABLE partial_change(id INTEGER); INSERT INTO missing_table VALUES(1);" },
      ]);
    } catch (error) { failure = error; }
    assert.ok(failure instanceof MigrationError);
    assert.ok(failure.snapshot);
    assert.equal(db.isTransaction, false);
    assert.equal(schemaVersion(db), 1);
    assert.equal(db.prepare('SELECT body FROM probe_note').get()?.body, 'retained legacy data');
    assert.equal(db.prepare("SELECT name FROM sqlite_schema WHERE name='partial_change'").get(), undefined);
    const restoredPath = join(directory, 'failure-recovered.db');
    await restoreSnapshot(failure.snapshot.path, restoredPath);
    const restored = new DatabaseSync(restoredPath, { readOnly: true });
    try { assert.equal(restored.prepare('SELECT body FROM probe_note').get()?.body, 'retained legacy data'); }
    finally { restored.close(); }
  } finally { db.close(); }
});

test('backup failure prevents any schema upgrade', async t => {
  const { directory, path } = await fixture(t);
  const legacy = legacyStore(path);
  legacy.close();
  await writeFile(join(directory, 'backups'), 'blocked backup directory');
  await assert.rejects(() => openStore(path), MigrationError);
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    assert.equal(schemaVersion(db), 1);
    assert.equal(db.prepare('SELECT body FROM probe_note').get()?.body, 'retained legacy data');
  } finally { db.close(); }
});

test('recovery rejects existing targets, orphaned WAL files and tampered snapshots', async t => {
  const { directory, path } = await fixture(t);
  const store = await openStore(path);
  try {
    store.save('preserve original');
    const snapshot = await store.snapshot(join(directory, 'backups'));
    const original = await readFile(path);
    await assert.rejects(() => restoreSnapshot(snapshot.path, path));
    assert.deepEqual(await readFile(path), original);
    const target = join(directory, 'new.db');
    await writeFile(target + '-wal', 'preserve orphan');
    await assert.rejects(() => restoreSnapshot(snapshot.path, target), /RESTORE_TARGET_HAS_SIDECARS/);
    await assert.rejects(() => access(target));
    assert.equal(await readFile(target + '-wal', 'utf8'), 'preserve orphan');
    await appendFile(snapshot.path, 'tamper');
    await assert.rejects(() => restoreSnapshot(snapshot.path, join(directory, 'tampered.db')), /BACKUP_CHECKSUM_MISMATCH/);
    assert.equal(store.read(), 'preserve original');
  } finally { store.close(); }
});

test('unknown schema-zero databases are refused without changing their contents', async t => {
  const { path } = await fixture(t);
  const db = new DatabaseSync(path);
  db.exec("CREATE TABLE unrelated(value TEXT); INSERT INTO unrelated VALUES('keep');");
  db.close();
  const before = await readFile(path);
  await assert.rejects(() => openStore(path), /UNRECOGNIZED_DATABASE/);
  assert.deepEqual(await readFile(path), before);
});

test('a migration plan for an older schema refuses the newer database without writes', async t => {
  const { path } = await fixture(t);
  const store = await openStore(path);
  store.close();
  const before = await readFile(path);
  const db = new DatabaseSync(path);
  try { await assert.rejects(() => migrateDatabase(db, path, [{ version: 1, sql: 'SELECT 1;' }]), /NEWER_DATABASE/); }
  finally { db.close(); }
  assert.deepEqual(await readFile(path), before);
});
