import test from 'node:test';
import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openWorkspaceStore } from '../src/workspace/store.ts';
import { APPLICATION_ID, MIGRATIONS } from '../src/database/schema.ts';
import { startWorkspaceServer } from '../src/workspace/server.ts';
import { migrateDatabase } from '../src/database/migrate.ts';
import { restoreSnapshot } from '../src/database/backup.ts';
import { HISTORY_LIMIT } from '../src/shared/tasks.ts';
import type { TaskView } from '../src/shared/tasks.ts';
import { request as httpRequest } from 'node:http';
import { randomUUID } from 'node:crypto';

async function fixture(t: TestContext) {
  const directory = await mkdtemp(join(tmpdir(), 'focusflow-tasks-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return { directory, path: join(directory, 'tracker.db') };
}

test('dated tasks keep original dates across midnight, status transitions and restart', async t => {
  const { path } = await fixture(t);
  let now = new Date(2026, 10, 4, 23, 59);
  let store = await openWorkspaceStore(path, () => now);
  const unicode = '\u4eca\u5929 <script>alert(1)</script> "); DROP TABLE tasks; --';
  const old = store.tasks.add({ title: unicode, plannedDate: '2026-11-03' });
  const today = store.tasks.add({ title: 'Today', plannedDate: '2026-11-04' });
  const future = store.tasks.add({ title: 'Tomorrow', plannedDate: '2026-11-05' });
  assert.equal(store.tasks.view().due.length, 2); assert.equal(store.tasks.view().upcoming.length, 1);
  const completed = store.tasks.resolve(today.id, 'completed');
  now = new Date(2026, 10, 5, 0, 1);
  assert.equal(store.tasks.resolve(today.id, 'completed')?.resolvedAt, completed?.resolvedAt);
  assert.throws(() => store.tasks.resolve(today.id, 'cancelled'), /already resolved/);
  store.tasks.resolve(future.id, 'cancelled');
  store.close();
  store = await openWorkspaceStore(path, () => now);
  try {
    const view = store.tasks.view();
    assert.equal(view.today, '2026-11-05');
    assert.deepEqual(view.due.map(task => [task.id, task.title, task.plannedDate]), [[old.id, unicode, '2026-11-03']]);
    assert.equal(view.upcoming.length, 0); assert.equal(view.history.length, 2);
    assert.equal(store.tasks.resolve('missing', 'completed'), undefined);
  } finally { store.close(); }
});

test('reopening returns one completion credit and keeps repeating occurrences to their current period', async t => {
  const { path } = await fixture(t);
  let now = new Date(2026, 10, 4, 9);
  const store = await openWorkspaceStore(path, () => now);
  try {
    const task = store.tasks.add({ title: 'Five points', plannedDate: '2026-11-04' });
    store.tasks.resolve(task.id, 'completed');
    assert.equal(store.personal.view().balance, 500);
    assert.equal(store.tasks.reopen(task.id)?.status, 'pending');
    assert.equal(store.personal.view().balance, 0);
    assert.equal(store.tasks.reopen(task.id)?.status, 'pending');
    assert.equal(store.personal.view().balance, 0);
    store.tasks.resolve(task.id, 'completed');
    assert.equal(store.personal.view().balance, 500);
    const cancelled = store.tasks.add({ title: 'Cancelled by mistake', plannedDate: '2026-11-03' });
    store.tasks.resolve(cancelled.id, 'cancelled');
    assert.equal(store.tasks.reopen(cancelled.id)?.plannedDate, '2026-11-03');
    assert.ok(store.tasks.view().due.some(item => item.id === cancelled.id));
    store.tasks.addRecurrence({ title: 'Daily', plannedDate: '2026-11-04', frequency: 'daily' });
    const occurrence = store.tasks.view().due.find(item => item.title === 'Daily')!;
    store.tasks.resolve(occurrence.id, 'cancelled');
    assert.equal(store.tasks.reopen(occurrence.id)?.status, 'pending');
    store.tasks.resolve(occurrence.id, 'completed');
    now = new Date(2026, 10, 5, 9);
    assert.throws(() => store.tasks.reopen(occurrence.id), /current occurrence/);
    assert.equal(store.tasks.view().history.find(item => item.id === occurrence.id)?.status, 'completed');
    assert.equal(store.tasks.reopen('missing'), undefined);
  } finally { store.close(); }
});

test('a habit keeps its plan, plan edits apply, an invalid plan saves nothing and daily points add up', async t => {
  const { path } = await fixture(t);
  const store = await openWorkspaceStore(path, () => new Date(2026, 10, 4, 9));
  try {
    const plan = { rate: 150, target: 10, cue: 'pour my morning coffee', identity: 'I am a calm person', time: '07:30',
      place: 'Living room', starter: 'Take one slow breath', bundle: 'calm music' };
    const rule = store.tasks.addRecurrence({ title: 'Meditate', plannedDate: '2026-11-04', frequency: 'daily', habit: true, plan });
    const saved: Record<string, unknown> = { ...store.personal.view().rules.find(item => item.subject === rule.id) };
    const expected: Record<string, unknown> = { subject: rule.id, mode: 'minutes', unit: 'minutes', ...plan };
    assert.deepEqual(Object.fromEntries(Object.keys(expected).map(key => [key, saved[key]])), expected);
    const occurrence = store.tasks.view().due[0]!;
    store.personal.mutate('rule', { subject: occurrence.id, mode: 'minutes', rate: 200, target: 5,
      cue: 'finish breakfast', identity: '', time: '', place: '', starter: '', bundle: '' });
    assert.equal(store.personal.view().rules.find(item => item.subject === rule.id)?.cue, 'finish breakfast');
    store.personal.mutate('log', { id: randomUUID(), day: '2026-11-04', subject: occurrence.id, minutes: 3 });
    assert.deepEqual({ ...store.personal.view().week.points }, { '2026-11-04': 600 });
    assert.throws(() => store.tasks.add({ title: 'Bad time', plannedDate: '2026-11-04', frequency: 'none', plan: { ...plan, time: '25:00' } }),
      /valid time/);
    assert.equal(store.tasks.view().due.some(item => item.title === 'Bad time'), false);
  } finally { store.close(); }
});

test('Personal view counts identity votes and recent habit outcomes', async t => {
  const { path } = await fixture(t);
  let now = new Date(2026, 10, 2, 9);
  const store = await openWorkspaceStore(path, () => now);
  try {
    const plan = { rate: 100, target: 10, cue: '', identity: 'A reader', time: '', place: '', starter: '', bundle: '' };
    const read = store.tasks.addRecurrence({ title: 'Read', plannedDate: '2026-11-02', frequency: 'daily', habit: true, plan });
    const journal = store.tasks.addRecurrence({ title: 'Journal', plannedDate: '2026-11-02', frequency: 'daily',
      plan: { ...plan, identity: 'a reader' } });
    const occurrence = (rule: { id: string }) => store.tasks.view().due.find(task => task.recurrenceId === rule.id)!;
    // November 2: three minutes on Read (below its target) and Journal done.
    store.personal.mutate('log', { id: randomUUID(), day: '2026-11-02', subject: occurrence(read).id, minutes: 3 });
    store.tasks.resolve(occurrence(journal).id, 'completed');
    // November 3: Read rests and Journal is missed.
    now = new Date(2026, 10, 3, 9);
    store.tasks.resolve(occurrence(read).id, 'cancelled');
    // November 4: twelve minutes on Read cast today's vote.
    now = new Date(2026, 10, 4, 9);
    store.personal.mutate('log', { id: randomUUID(), day: '2026-11-04', subject: occurrence(read).id, minutes: 12 });
    const view = store.personal.view();
    assert.deepEqual({ ...view.recent[read.id] }, { '2026-11-02': 'started', '2026-11-03': 'rest' });
    assert.deepEqual({ ...view.recent[journal.id] }, { '2026-11-02': 'done', '2026-11-03': 'missed' });
    assert.deepEqual({ ...view.votes }, { 'a reader': 3 });
  } finally { store.close(); }
});

test('focus keeps up to three one-off tasks and rescheduling moves a task out of earlier focus', async t => {
  const { path } = await fixture(t);
  const store = await openWorkspaceStore(path, () => new Date(2026, 10, 4, 20));
  try {
    const a = store.tasks.add({ title: 'A', plannedDate: '2026-11-04' });
    const b = store.tasks.add({ title: 'B', plannedDate: '2026-11-03' });
    const c = store.tasks.add({ title: 'C', plannedDate: '2026-11-05' });
    const d = store.tasks.add({ title: 'D', plannedDate: '2026-11-04' });
    store.tasks.setFocus({ day: '2026-11-04', taskIds: [a.id, b.id] });
    assert.deepEqual(store.tasks.view().focus, { today: [a.id, b.id], tomorrow: [] });
    assert.throws(() => store.tasks.setFocus({ day: '2026-11-04', taskIds: [c.id] }), /due by that day/);
    assert.throws(() => store.tasks.setFocus({ day: '2026-11-04', taskIds: [a.id, b.id, c.id, d.id] }), /up to three/);
    assert.throws(() => store.tasks.setFocus({ day: '2026-11-06', taskIds: [] }), /today or tomorrow/);
    store.tasks.setFocus({ day: '2026-11-05', taskIds: [c.id, a.id] });
    store.tasks.resolve(a.id, 'completed');
    store.tasks.setFocus({ day: '2026-11-04', taskIds: [a.id, d.id] });
    store.tasks.reschedule(d.id, { plannedDate: '2026-11-05' });
    assert.deepEqual(store.tasks.view().focus, { today: [a.id], tomorrow: [c.id, a.id] });
    assert.equal(store.tasks.view().upcoming.find(item => item.id === d.id)?.plannedDate, '2026-11-05');
    assert.throws(() => store.tasks.reschedule(a.id, { plannedDate: '2026-11-06' }), /open one-off/);
    assert.throws(() => store.tasks.reschedule(b.id, { plannedDate: '2026-11-01' }), /today or a later date/);
  } finally { store.close(); }
});

test('history returns the latest resolved tasks within the display limit', async t => {
  const { path } = await fixture(t);
  let seconds = 0;
  const store = await openWorkspaceStore(path, () => new Date(2026, 10, 4, 9, 0, seconds++));
  try {
    for (let index = 0; index < HISTORY_LIMIT + 5; index++) {
      const task = store.tasks.add({ title: 'Resolved ' + index, plannedDate: '2026-11-04' });
      store.tasks.resolve(task.id, 'cancelled');
    }
    const open = store.tasks.add({ title: 'Still open', plannedDate: '2026-11-04' });
    const view = store.tasks.view();
    assert.equal(view.history.length, HISTORY_LIMIT);
    assert.equal(view.history[0]?.title, 'Resolved ' + (HISTORY_LIMIT + 4));
    assert.equal(view.history.some(item => item.title === 'Resolved 4'), false);
    assert.deepEqual(view.due.map(item => item.id), [open.id]);
  } finally { store.close(); }
});

test('invalid task input cannot create or resolve records', async t => {
  const { path } = await fixture(t); const store = await openWorkspaceStore(path);
  try {
    for (const input of [null, {}, { title: ' ', plannedDate: '2026-11-04' },
      { title: 'x'.repeat(301), plannedDate: '2026-11-04' }, { title: 'Bad', plannedDate: '2026-02-29' },
      { title: 'Bad', plannedDate: '2026-04-31' }, { title: 'Bad', plannedDate: '2026-1-2' }]) assert.throws(() => store.tasks.add(input));
    const task = store.tasks.add({ title: 'Valid leap day', plannedDate: '2028-02-29' });
    assert.throws(() => store.tasks.resolve(task.id, 'pending'));
    assert.equal(store.tasks.view().due.length + store.tasks.view().upcoming.length, 1);
  } finally { store.close(); }
});

test('foreign spike databases and newer product schemas are refused without byte changes', async t => {
  const { directory } = await fixture(t);
  for (const kind of ['foreign', 'newer']) {
    const path = join(directory, kind + '.db'); const db = new DatabaseSync(path);
    if (kind === 'foreign') db.exec("CREATE TABLE probe_note(body TEXT); INSERT INTO probe_note VALUES('keep'); PRAGMA user_version=2;");
    else db.exec(`PRAGMA application_id=${APPLICATION_ID}; PRAGMA user_version=999;`);
    db.close(); const before = await readFile(path);
    await assert.rejects(openWorkspaceStore(path), kind === 'foreign' ? /UNRECOGNIZED_PRODUCT_DATABASE/ : /NEWER_DATABASE/);
    assert.deepEqual(await readFile(path), before);
  }
});

test('synthetic product schema 1 upgrades with a verified snapshot and separate recovery', async t => {
  const { path, directory } = await fixture(t); const db = new DatabaseSync(path);
  db.exec(MIGRATIONS[0].sql); db.exec('PRAGMA user_version=1');
  db.prepare("INSERT INTO tasks VALUES('prior-task','Keep me','2026-11-04','pending','2026-11-04T00:00:00Z',NULL)").run();
  db.close();
  let store = await openWorkspaceStore(path, () => new Date(2026, 10, 4));
  assert.equal(store.tasks.view().due[0]?.title, 'Keep me'); store.close();
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
  try { await assert.rejects(migrateDatabase(older, path, MIGRATIONS.slice(0, 1)), /NEWER_DATABASE/); }
  finally { older.close(); }
  assert.deepEqual(await readFile(path), before);
  store = await openWorkspaceStore(path); store.close();
  assert.equal((await readdir(join(directory, 'backups'))).filter(name => name.endsWith('.db')).length, 1);
});

test('product task HTTP operations persist separately from spike notes and preserve conflicts', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'focusflow-tasks-http-test-'));
  const spike = new DatabaseSync(join(directory, 'phase0.db')); spike.exec("CREATE TABLE note(body); INSERT INTO note VALUES('private spike');"); spike.close();
  const spikeBytes = await readFile(join(directory, 'phase0.db'));
  let app = await startWorkspaceServer({ dataDirectory: directory, clock: () => new Date(2026, 10, 4) });
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
  await app.close(); app = await startWorkspaceServer({ dataDirectory: directory, clock: () => new Date(2026, 10, 5) });
  const view = await (await fetch(app.origin + '/api/tasks')).json() as TaskView;
  assert.equal(view.due.length, 0); assert.equal(view.history[0]?.status, 'completed');
  assert.deepEqual(await readFile(join(directory, 'phase0.db')), spikeBytes);
});

test('task API rejects missing origin, malformed JSON and unsupported media without changes', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'focusflow-task-http-validation-'));
  const app = await startWorkspaceServer({ dataDirectory: directory });
  t.after(async () => { await app.close(); await rm(directory, { recursive: true, force: true }); });
  const send = (headers: Record<string, string>, body: string) => fetch(app.origin + '/api/tasks', { method: 'POST', headers, body });
  assert.equal((await send({ 'Content-Type': 'application/json' }, '{}')).status, 403);
  assert.equal((await send({ Origin: app.origin, 'Content-Type': 'text/plain' }, '{}')).status, 415);
  assert.equal((await send({ Origin: app.origin, 'Content-Type': 'application/json' }, '{')).status, 400);
  const view = await (await fetch(app.origin + '/api/tasks')).json() as TaskView;
  assert.equal(view.due.length + view.upcoming.length + view.history.length, 0);
});
