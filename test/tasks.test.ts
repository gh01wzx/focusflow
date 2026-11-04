import test from 'node:test';
import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openTaskStore, TASK_APPLICATION_ID, TASK_MIGRATIONS } from '../src/tasks/store.ts';
import { startTaskServer } from '../src/tasks/server.ts';
import { migrateDatabase } from '../src/database/migrate.ts';
import { restoreSnapshot } from '../src/database/backup.ts';
import type { TaskView } from '../src/tasks/model.ts';
import { request as httpRequest } from 'node:http';

async function fixture(t: TestContext) {
  const directory = await mkdtemp(join(tmpdir(), 'focusflow-tasks-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return { directory, path: join(directory, 'tracker.db') };
}

test('dated tasks keep original dates across midnight, status transitions and restart', async t => {
  const { path } = await fixture(t);
  let now = new Date(2026, 10, 4, 23, 59);
  let store = await openTaskStore(path, () => now);
  const unicode = '\u4eca\u5929 <script>alert(1)</script> "); DROP TABLE tasks; --';
  const old = store.add({ title: unicode, plannedDate: '2026-11-03' });
  const today = store.add({ title: 'Today', plannedDate: '2026-11-04' });
  const future = store.add({ title: 'Tomorrow', plannedDate: '2026-11-05' });
  assert.equal(store.view().due.length, 2); assert.equal(store.view().upcoming.length, 1);
  const completed = store.resolve(today.id, 'completed');
  now = new Date(2026, 10, 5, 0, 1);
  assert.equal(store.resolve(today.id, 'completed')?.resolvedAt, completed?.resolvedAt);
  assert.throws(() => store.resolve(today.id, 'cancelled'), /already resolved/);
  store.resolve(future.id, 'cancelled');
  store.close();
  store = await openTaskStore(path, () => now);
  try {
    const view = store.view();
    assert.equal(view.today, '2026-11-05');
    assert.deepEqual(view.due.map(task => [task.id, task.title, task.plannedDate]), [[old.id, unicode, '2026-11-03']]);
    assert.equal(view.upcoming.length, 0); assert.equal(view.history.length, 2);
    assert.equal(store.resolve('missing', 'completed'), undefined);
  } finally { store.close(); }
});

test('invalid task input cannot create or resolve records', async t => {
  const { path } = await fixture(t); const store = await openTaskStore(path);
  try {
    for (const input of [null, {}, { title: ' ', plannedDate: '2026-11-04' },
      { title: 'x'.repeat(301), plannedDate: '2026-11-04' }, { title: 'Bad', plannedDate: '2026-02-29' },
      { title: 'Bad', plannedDate: '2026-04-31' }, { title: 'Bad', plannedDate: '2026-1-2' }]) assert.throws(() => store.add(input));
    const task = store.add({ title: 'Valid leap day', plannedDate: '2028-02-29' });
    assert.throws(() => store.resolve(task.id, 'pending'));
    assert.equal(store.view().due.length + store.view().upcoming.length, 1);
  } finally { store.close(); }
});

test('foreign spike databases and newer product schemas are refused without byte changes', async t => {
  const { directory } = await fixture(t);
  for (const kind of ['foreign', 'newer']) {
    const path = join(directory, kind + '.db'); const db = new DatabaseSync(path);
    if (kind === 'foreign') db.exec("CREATE TABLE probe_note(body TEXT); INSERT INTO probe_note VALUES('keep'); PRAGMA user_version=2;");
    else db.exec(`PRAGMA application_id=${TASK_APPLICATION_ID}; PRAGMA user_version=999;`);
    db.close(); const before = await readFile(path);
    await assert.rejects(openTaskStore(path), kind === 'foreign' ? /UNRECOGNIZED_PRODUCT_DATABASE/ : /NEWER_DATABASE/);
    assert.deepEqual(await readFile(path), before);
  }
});

test('synthetic product schema 1 upgrades with a verified snapshot and separate recovery', async t => {
  const { path, directory } = await fixture(t); const db = new DatabaseSync(path);
  db.exec(TASK_MIGRATIONS[0].sql); db.exec('PRAGMA user_version=1');
  db.prepare("INSERT INTO tasks VALUES('prior-task','Keep me','2026-11-04','pending','2026-11-04T00:00:00Z',NULL)").run();
  db.close();
  let store = await openTaskStore(path, () => new Date(2026, 10, 4));
  assert.equal(store.view().due[0]?.title, 'Keep me'); store.close();
  const backups = (await readdir(join(directory, 'backups'))).filter(name => name.endsWith('.db'));
  assert.equal(backups.length, 1);
  const restored = join(directory, 'restored.db');
  await restoreSnapshot(join(directory, 'backups', backups[0]!), restored);
  const reader = new DatabaseSync(restored, { readOnly: true });
  try {
    assert.equal(reader.prepare('PRAGMA user_version').get()?.user_version, 1);
    assert.equal(reader.prepare('SELECT title FROM tasks').get()?.title, 'Keep me');
  } finally { reader.close(); }
  const before = await readFile(path); const older = new DatabaseSync(path);
  try { await assert.rejects(migrateDatabase(older, path, TASK_MIGRATIONS.slice(0, 1)), /NEWER_DATABASE/); }
  finally { older.close(); }
  assert.deepEqual(await readFile(path), before);
  store = await openTaskStore(path); store.close();
  assert.equal((await readdir(join(directory, 'backups'))).filter(name => name.endsWith('.db')).length, 1);
});

test('product task HTTP operations persist separately from spike notes and preserve conflicts', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'focusflow-tasks-http-test-'));
  const spike = new DatabaseSync(join(directory, 'phase0.db')); spike.exec("CREATE TABLE note(body); INSERT INTO note VALUES('private spike');"); spike.close();
  const spikeBytes = await readFile(join(directory, 'phase0.db'));
  let app = await startTaskServer({ dataDirectory: directory, clock: () => new Date(2026, 10, 4) });
  t.after(async () => { await app.close(); await rm(directory, { recursive: true, force: true }); });
  const post = (path: string, value: unknown, headers: Record<string, string> = {}) => fetch(app.origin + path, {
    method: 'POST', headers: { Origin: app.origin, 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(value),
  });
  assert.equal((await fetch(app.origin)).status, 200);
  assert.equal((await post('/api/tasks', { title: ' ', plannedDate: '2026-11-04' })).status, 400);
  const added = await post('/api/tasks', { title: 'Overdue', plannedDate: '2026-11-03' });
  assert.equal(added.status, 201); const payload = await added.json() as { task: { id: string }; view: TaskView };
  assert.equal(payload.view.due[0]?.plannedDate, '2026-11-03');
  const url = `/api/tasks/${payload.task.id}/resolve`;
  assert.equal((await post(url, { status: 'completed' })).status, 200);
  assert.equal((await post(url, { status: 'cancelled' })).status, 400);
  assert.equal((await post('/api/tasks', { title: 'Denied', plannedDate: '2026-11-04' }, { Origin: 'https://other.example' })).status, 403);
  assert.equal((await post('/api/tasks', { title: 'x'.repeat(5000), plannedDate: '2026-11-04' })).status, 413);
  assert.equal((await post('/api/tasks/backup', {})).status, 201);
  const status = await new Promise<number | undefined>((resolve, reject) => {
    const request = httpRequest(app.origin, { headers: { Host: 'other.example' } }, response => { response.resume(); resolve(response.statusCode); });
    request.on('error', reject); request.end();
  }); assert.equal(status, 403);
  await app.close(); app = await startTaskServer({ dataDirectory: directory, clock: () => new Date(2026, 10, 5) });
  const view = await (await fetch(app.origin + '/api/tasks')).json() as TaskView;
  assert.equal(view.due.length, 0); assert.equal(view.history[0]?.status, 'completed');
  assert.deepEqual(await readFile(join(directory, 'phase0.db')), spikeBytes);
});

test('task API rejects missing origin, malformed JSON and unsupported media without changes', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'focusflow-task-http-validation-'));
  const app = await startTaskServer({ dataDirectory: directory });
  t.after(async () => { await app.close(); await rm(directory, { recursive: true, force: true }); });
  const send = (headers: Record<string, string>, body: string) => fetch(app.origin + '/api/tasks', { method: 'POST', headers, body });
  assert.equal((await send({ 'Content-Type': 'application/json' }, '{}')).status, 403);
  assert.equal((await send({ Origin: app.origin, 'Content-Type': 'text/plain' }, '{}')).status, 415);
  assert.equal((await send({ Origin: app.origin, 'Content-Type': 'application/json' }, '{')).status, 400);
  const view = await (await fetch(app.origin + '/api/tasks')).json() as TaskView;
  assert.equal(view.due.length + view.upcoming.length + view.history.length, 0);
});
