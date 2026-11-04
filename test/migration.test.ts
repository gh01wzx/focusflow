import test from 'node:test';
import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { access, appendFile, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openWorkspaceStore } from '../src/workspace/store.ts';
import { MIGRATIONS, SCHEMA_VERSION } from '../src/database/schema.ts';
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

const openStore = (path: string) => openWorkspaceStore(path, () => new Date(2026, 10, 4));

function priorSchema(path: string): DatabaseSync {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode=WAL;');
  db.exec(MIGRATIONS[0].sql);
  db.exec("INSERT INTO tasks VALUES('prior-task','Retained task','2026-11-04','pending','2026-11-04T00:00:00Z',NULL); PRAGMA user_version=1;");
  return db;
}

test('schema upgrade snapshots committed WAL data and is not repeated on reopen', async t => {
  const { directory, path } = await fixture(t);
  const legacy = priorSchema(path);
  try {
    const store = await openStore(path);
    try { assert.equal(store.tasks.view().due[0]?.title, 'Retained task'); } finally { store.close(); }
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
      assert.equal(recovered.prepare('SELECT title FROM tasks').get()?.title, 'Retained task');
    } finally { recovered.close(); }
    const reopened = await openStore(path);
    try { assert.equal(reopened.tasks.view().due[0]?.title, 'Retained task'); } finally { reopened.close(); }
    assert.deepEqual(await readdir(join(directory, 'backups')), files);
  } finally { legacy.close(); }
});

test('a migration failure rolls back schema and data while preserving a recoverable snapshot', async t => {
  const { directory, path } = await fixture(t);
  const db = priorSchema(path);
  try {
    let failure: unknown;
    try {
      await migrateDatabase(db, path, [
        { version: 1, sql: 'SELECT 1;' },
        { version: 2, sql: "UPDATE tasks SET title='must roll back'; CREATE TABLE partial_change(id INTEGER); INSERT INTO missing_table VALUES(1);" },
      ]);
    } catch (error) { failure = error; }
    assert.ok(failure instanceof MigrationError);
    assert.ok(failure.snapshot);
    assert.equal(db.isTransaction, false);
    assert.equal(schemaVersion(db), 1);
    assert.equal(db.prepare('SELECT title FROM tasks').get()?.title, 'Retained task');
    assert.equal(db.prepare("SELECT name FROM sqlite_schema WHERE name='partial_change'").get(), undefined);
    const restoredPath = join(directory, 'failure-recovered.db');
    await restoreSnapshot(failure.snapshot.path, restoredPath);
    const restored = new DatabaseSync(restoredPath, { readOnly: true });
    try { assert.equal(restored.prepare('SELECT title FROM tasks').get()?.title, 'Retained task'); }
    finally { restored.close(); }
  } finally { db.close(); }
});

test('backup failure prevents any schema upgrade', async t => {
  const { directory, path } = await fixture(t);
  const legacy = priorSchema(path);
  legacy.close();
  await writeFile(join(directory, 'backups'), 'blocked backup directory');
  await assert.rejects(() => openStore(path), MigrationError);
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    assert.equal(schemaVersion(db), 1);
    assert.equal(db.prepare('SELECT title FROM tasks').get()?.title, 'Retained task');
  } finally { db.close(); }
});

test('recovery rejects existing targets, orphaned WAL files and tampered snapshots', async t => {
  const { directory, path } = await fixture(t);
  const store = await openStore(path);
  try {
    store.tasks.add({ title: 'Preserve original', plannedDate: '2026-11-04' });
    const snapshot = await store.snapshot();
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
    assert.equal(store.tasks.view().due[0]?.title, 'Preserve original');
  } finally { store.close(); }
});

test('unknown schema-zero databases are refused without changing their contents', async t => {
  const { path } = await fixture(t);
  const db = new DatabaseSync(path);
  db.exec("CREATE TABLE unrelated(value TEXT); INSERT INTO unrelated VALUES('keep');");
  db.close();
  const before = await readFile(path);
  await assert.rejects(() => openStore(path), /UNRECOGNIZED_PRODUCT_DATABASE/);
  assert.deepEqual(await readFile(path), before);
});

test('online product backup includes committed WAL data and stays independent of later changes', async t => {
  const { directory, path } = await fixture(t);
  const store = await openStore(path);
  try {
    store.tasks.add({ title: 'In the snapshot', plannedDate: '2026-11-04' });
    assert.ok((await readFile(path + '-wal')).length > 0);
    const snapshot = await store.snapshot();
    store.tasks.add({ title: 'After the snapshot', plannedDate: '2026-11-04' });
    const restoredPath = join(directory, 'independent.db');
    await restoreSnapshot(snapshot.path, restoredPath);
    const restored = await openStore(restoredPath);
    try { assert.deepEqual(restored.tasks.view().due.map(task => task.title), ['In the snapshot']); }
    finally { restored.close(); }
    assert.equal(store.tasks.view().due.length, 2);
  } finally { store.close(); }
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
