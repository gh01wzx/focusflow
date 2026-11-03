import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, copyFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openStore } from '../src/store.mjs';

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'focusflow-store-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return { directory, path: join(directory, 'test.db') };
}

test('saved Unicode and SQL-like text survives database close and reopen', async t => {
  const { path } = await fixture(t);
  let store = openStore(path);
  const value = "重启后仍在 😊 '); DROP TABLE probe_note; --";
  store.save(value);
  store.close();
  store = openStore(path);
  try { assert.equal(store.read(), value); } finally { store.close(); }
});

test('online backup includes committed WAL data and restores independently', async t => {
  const { directory, path } = await fixture(t);
  const store = openStore(path);
  try {
    store.save('snapshot value');
    const snapshot = await store.snapshot(join(directory, 'backups'));
    store.save('later change');
    const restoredPath = join(directory, 'restored.db');
    await copyFile(snapshot.path, restoredPath);
    const restored = openStore(restoredPath);
    try { assert.equal(restored.read(), 'snapshot value'); } finally { restored.close(); }
    assert.equal(store.read(), 'later change');
  } finally { store.close(); }
});

test('older application refuses a newer schema without changing database bytes', async t => {
  const { path } = await fixture(t);
  const db = new DatabaseSync(path);
  db.exec('PRAGMA user_version=999; CREATE TABLE future_data(value TEXT); INSERT INTO future_data VALUES(\'keep\');');
  db.close();
  const before = await readFile(path);
  assert.throws(() => openStore(path), /NEWER_DATABASE/);
  assert.deepEqual(await readFile(path), before);
});

test('invalid input is rejected without overwriting the stored value', async t => {
  const { path } = await fixture(t);
  const store = openStore(path);
  try {
    store.save('keep');
    for (const value of [null, 123, 'x'.repeat(501)]) assert.throws(() => store.save(value), TypeError);
    assert.equal(store.read(), 'keep');
  } finally { store.close(); }
});
