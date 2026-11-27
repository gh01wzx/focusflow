import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { openWorkspaceStore } from '../src/workspace/store.ts';
import { createDataCare } from '../src/workspace/care.ts';
import { dataLocationReady, readDataLocation, saveDataLocation } from '../src/runtime/location.ts';

async function fixture(t: test.TestContext) {
  const root = await mkdtemp(join(tmpdir(), 'focusflow-care-test-'));
  const data = join(root, 'profile', 'data');
  const store = await openWorkspaceStore(join(data, 'tracker.db'), () => new Date(2026, 10, 27, 9));
  store.someday.add({ title: 'Kept across folders' });
  const saved: (string | null)[] = [];
  let restarts = 0;
  let picked: string | null = null;
  const care = createDataCare(store, { data, exports: join(root, 'profile', 'exports') }, { dataLocation: {
    defaultDirectory: data, choose: async () => picked, save: directory => { saved.push(directory); }, restart: () => { restarts++; },
  } });
  // Close before removing, so Windows releases the database files.
  t.after(async () => {
    await care.close();
    store.close();
    assert.equal(dirname(resolve(root)), resolve(tmpdir()));
    assert.ok(basename(root).startsWith('focusflow-care-test-'));
    await rm(root, { recursive: true, force: true });
  });
  return { root, data, care, saved, pick: (folder: string | null) => { picked = folder; }, restarts: () => restarts };
}
const titles = (path: string) => {
  const db = new DatabaseSync(path, { readOnly: true });
  try { return db.prepare('SELECT title FROM someday_items').all().map(row => row.title); } finally { db.close(); }
};
const settle = () => new Promise(resolve => setTimeout(resolve, 450));

test('the data folder moves to an empty folder with a verified copy and restarts', async t => {
  const f = await fixture(t);
  assert.equal((await f.care.status()).defaultData, true);
  f.pick(null);
  assert.equal(await f.care.chooseDataFolder(), null);
  const target = join(f.root, 'second drive');
  f.pick(target);
  const move = await f.care.chooseDataFolder();
  assert.deepEqual(move, { directory: resolve(target), existing: null });
  await assert.rejects(Promise.resolve().then(() => f.care.moveData({ directory: move!.directory, mode: 'switch' })), /how to use/);
  await assert.rejects(Promise.resolve().then(() => f.care.moveData({ directory: join(f.root, 'other'), mode: 'copy' })), /again/);
  assert.deepEqual(await f.care.moveData({ directory: move!.directory, mode: 'copy' }), { restarting: true });
  assert.deepEqual(titles(join(target, 'tracker.db')), ['Kept across folders']);
  assert.deepEqual(titles(join(f.data, 'tracker.db')), ['Kept across folders'], 'The previous folder keeps its copy.');
  assert.deepEqual(f.saved, [resolve(target)]);
  await settle();
  assert.equal(f.restarts(), 1);
});

test('a folder with other files gets a FocusFlow folder; FocusFlow data is used or replaced', async t => {
  const f = await fixture(t);
  const busy = join(f.root, 'Documents');
  await mkdir(busy, { recursive: true });
  await writeFile(join(busy, 'notes.txt'), 'mine');
  f.pick(busy);
  assert.equal((await f.care.chooseDataFolder())?.directory, join(resolve(busy), 'FocusFlow'));
  f.pick(join(f.data, 'backups'));
  await assert.rejects(f.care.chooseDataFolder(), /outside/);
  f.pick(f.data);
  await assert.rejects(f.care.chooseDataFolder(), /already in this folder/);

  // Another FocusFlow profile's data can be used as it is, or replaced with a backup kept.
  const other = join(f.root, 'older');
  const store = await openWorkspaceStore(join(other, 'tracker.db'));
  store.someday.add({ title: 'Older idea' });
  store.close();
  f.pick(other);
  const move = await f.care.chooseDataFolder();
  assert.equal(move?.directory, resolve(other));
  assert.ok(move?.existing);
  await assert.rejects(Promise.resolve().then(() => f.care.moveData({ directory: move!.directory, mode: 'copy' })), /how to use/);
  await f.care.moveData({ directory: move!.directory, mode: 'replace' });
  assert.deepEqual(titles(join(other, 'tracker.db')), ['Kept across folders']);
  const replaced = (await readdir(join(other, 'backups'))).filter(name => name.startsWith('replaced-') && name.endsWith('.db'));
  assert.equal(replaced.length, 1);
  assert.deepEqual(titles(join(other, 'backups', replaced[0]!)), ['Older idea']);
  await settle();

  // A database that is not FocusFlow data is refused.
  const foreign = join(f.root, 'foreign');
  await mkdir(foreign);
  new DatabaseSync(join(foreign, 'tracker.db')).close();
  f.pick(foreign);
  await assert.rejects(f.care.chooseDataFolder(), /not FocusFlow data/);
});

test('the saved data folder is read back and counts only while its database is there', async t => {
  const root = await mkdtemp(join(tmpdir(), 'focusflow-care-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  assert.equal(readDataLocation(root), null);
  const chosen = join(root, 'chosen');
  saveDataLocation(root, chosen);
  assert.equal(readDataLocation(root), chosen);
  assert.equal(dataLocationReady(chosen), false);
  await mkdir(chosen);
  await writeFile(join(chosen, 'tracker.db'), '');
  assert.equal(dataLocationReady(chosen), true);
  saveDataLocation(root, null);
  assert.equal(readDataLocation(root), null);
  assert.equal(existsSync(join(root, 'data-location.json')), false);
  await writeFile(join(root, 'data-location.json'), '{"directory":"relative/path"}');
  assert.equal(readDataLocation(root), null);
});
