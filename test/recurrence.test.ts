import test from 'node:test';
import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openWorkspaceStore } from '../src/workspace/store.ts';
import { MIGRATIONS, SCHEMA_VERSION } from '../src/database/schema.ts';
import { restoreSnapshot } from '../src/database/backup.ts';
import { startWorkspaceServer } from '../src/workspace/server.ts';
import type { RecurrenceRule, TaskView } from '../src/shared/tasks.ts';

async function fixture(t: TestContext) {
  const directory = await mkdtemp(join(tmpdir(), 'focusflow-recurrence-test-'));
  t.after(async () => {
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
    assert.ok(basename(directory).startsWith('focusflow-recurrence-test-'));
    await rm(directory, { recursive: true, force: true });
  });
  return { directory, path: join(directory, 'tracker.db') };
}

test('daily rollover and closed-app catch-up record missed periods without overdue accumulation', async t => {
  const { path } = await fixture(t);
  let now = new Date(2026, 10, 4, 23, 59);
  let store = await openWorkspaceStore(path, () => now);
  try {
    const rule = store.tasks.addRecurrence({ title: 'Daily walk', plannedDate: '2026-11-04', frequency: 'daily' });
    const oneTime = store.tasks.add({ title: 'Call back', plannedDate: '2026-11-03' });
    const first = store.tasks.view().due.find(task => task.recurrenceId === rule.id)!;
    now = new Date(2026, 10, 5, 0, 1);
    const next = store.tasks.view();
    assert.equal(next.due.length, 2);
    assert.equal(next.due.find(task => task.id === oneTime.id)?.plannedDate, '2026-11-03');
    assert.equal(next.due.find(task => task.recurrenceId === rule.id)?.plannedDate, '2026-11-05');
    assert.equal(next.history[0]?.id, first.id);
    assert.equal(next.history[0]?.status, 'missed');
    assert.deepEqual(store.tasks.view(), next);
    store.close();
    now = new Date(2026, 10, 8);
    store = await openWorkspaceStore(path, () => now);
    const caughtUp = store.tasks.view();
    assert.deepEqual(caughtUp.history.map(task => task.plannedDate).sort(), ['2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07']);
    assert.ok(caughtUp.history.every(task => task.status === 'missed'));
    assert.equal(caughtUp.due.filter(task => task.recurrenceId === rule.id).length, 1);
    assert.equal(caughtUp.due.find(task => task.recurrenceId === rule.id)?.plannedDate, '2026-11-08');
    assert.deepEqual(store.tasks.view(), caughtUp);
  } finally { store.close(); }
});

test('completion and cancellation affect one occurrence and survive restart', async t => {
  const { path } = await fixture(t);
  let now = new Date(2026, 10, 4);
  let store = await openWorkspaceStore(path, () => now);
  try {
    store.tasks.addRecurrence({ title: '\u4eca\u5929 <script>test</script>', plannedDate: '2026-11-04', frequency: 'daily' });
    const first = store.tasks.view().due[0]!;
    const completed = store.tasks.resolve(first.id, 'completed')!;
    assert.equal(store.tasks.view().due.length, 0);
    now = new Date(2026, 10, 5);
    const second = store.tasks.view().due[0]!;
    assert.notEqual(first.id, second.id);
    store.tasks.resolve(second.id, 'cancelled');
    now = new Date(2026, 10, 6);
    const third = store.tasks.view().due[0]!;
    assert.equal(store.tasks.resolve(first.id, 'completed')?.resolvedAt, completed.resolvedAt);
    assert.throws(() => store.tasks.resolve(second.id, 'completed'), /already resolved/);
    store.close(); store = await openWorkspaceStore(path, () => now);
    assert.equal(store.tasks.view().due[0]?.id, third.id);
    assert.equal(store.tasks.view().due[0]?.title, first.title);
    assert.deepEqual(store.tasks.view().history.map(task => task.status).sort(), ['cancelled', 'completed']);
  } finally { store.close(); }
});

test('weekly periods last seven calendar days from the first date and do not reset on Monday', async t => {
  const { path } = await fixture(t);
  let now = new Date(2026, 10, 4);
  const store = await openWorkspaceStore(path, () => now);
  try {
    store.tasks.addRecurrence({ title: 'Weekly review', plannedDate: '2026-11-04', frequency: 'weekly' });
    const first = store.tasks.view().due[0]!;
    now = new Date(2026, 10, 10, 23, 59);
    assert.equal(store.tasks.view().due[0]?.id, first.id);
    now = new Date(2026, 10, 11);
    assert.equal(store.tasks.view().due[0]?.plannedDate, '2026-11-11');
    assert.equal(store.tasks.view().history[0]?.status, 'missed');
    now = new Date(2026, 10, 26);
    assert.equal(store.tasks.view().due[0]?.plannedDate, '2026-11-25');
    assert.deepEqual(store.tasks.view().history.map(task => task.plannedDate).sort(), ['2026-11-04', '2026-11-11', '2026-11-18']);
    // A clock rollback must not reopen missed periods or recreate completed work.
    now = new Date(2026, 10, 5);
    assert.equal(store.tasks.view().due.length, 0);
    assert.equal(store.tasks.view().upcoming.length, 1);
    now = new Date(2026, 10, 26);
    assert.equal(store.tasks.view().history.length, 3);
  } finally { store.close(); }
});

test('stopping future and current rules preserves history and never schedules another period', async t => {
  const { path } = await fixture(t);
  let now = new Date(2026, 10, 4);
  let store = await openWorkspaceStore(path, () => now);
  try {
    const future = store.tasks.addRecurrence({ title: 'Start later', plannedDate: '2026-11-06', frequency: 'daily' });
    const current = store.tasks.addRecurrence({ title: 'This week', plannedDate: '2026-11-04', frequency: 'weekly' });
    assert.equal(store.tasks.view().upcoming.length, 1);
    const stopped = store.tasks.stopRecurrence(future.id)!;
    now = new Date(2026, 10, 5);
    assert.equal(store.tasks.stopRecurrence(future.id)?.stoppedAt, stopped.stoppedAt);
    store.tasks.stopRecurrence(current.id);
    assert.equal(store.tasks.view().recurrences.length, 0);
    assert.equal(store.tasks.view().upcoming.length, 0);
    assert.equal(store.tasks.view().due[0]?.title, 'This week');
    assert.equal(store.tasks.view().history[0]?.status, 'cancelled');
    store.close();
    now = new Date(2026, 10, 20);
    store = await openWorkspaceStore(path, () => now);
    assert.equal(store.tasks.view().due.length, 0);
    assert.deepEqual(store.tasks.view().history.map(task => task.status).sort(), ['cancelled', 'missed']);
    assert.equal(store.tasks.stopRecurrence('missing'), undefined);
  } finally { store.close(); }
});

test('invalid recurrence definitions leave no rules or occurrences', async t => {
  const { path } = await fixture(t);
  const store = await openWorkspaceStore(path, () => new Date(2026, 10, 4));
  try {
    for (const input of [null, {},
      { title: 'Bad', plannedDate: '2026-11-04', frequency: 'monthly' },
      { title: 'Bad', plannedDate: '2026-11-03', frequency: 'daily' },
      { title: 'Bad', plannedDate: '2026-02-30', frequency: 'weekly' },
      { title: ' ', plannedDate: '2026-11-04', frequency: 'daily' },
      { title: 'x'.repeat(301), plannedDate: '2026-11-04', frequency: 'weekly' },
    ]) assert.throws(() => store.tasks.addRecurrence(input));
    assert.equal(store.tasks.view().recurrences.length + store.tasks.view().due.length + store.tasks.view().upcoming.length, 0);
  } finally { store.close(); }
});

test('Auckland DST rollover creates one daily occurrence per local date', async t => {
  const { path } = await fixture(t);
  const previous = process.env.TZ; process.env.TZ = 'Pacific/Auckland';
  let now = new Date('2026-09-26T11:30:00Z');
  const store = await openWorkspaceStore(path, () => now);
  try {
    store.tasks.addRecurrence({ title: 'Daily', plannedDate: '2026-09-26', frequency: 'daily' });
    now = new Date('2026-09-26T12:30:00Z');
    const occurrence = store.tasks.view().due[0]!;
    assert.equal(occurrence.plannedDate, '2026-09-27');
    now = new Date('2026-09-26T14:30:00Z');
    assert.equal(store.tasks.view().due[0]?.id, occurrence.id);
    now = new Date('2026-09-27T11:01:00Z');
    assert.equal(store.tasks.view().due[0]?.plannedDate, '2026-09-28');
    assert.equal(store.tasks.view().history.length, 2);
  } finally {
    store.close();
    if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous;
  }
});

test('schema 2 upgrade retains task identities and terminal states with a recoverable schema 2 snapshot', async t => {
  const { path, directory } = await fixture(t);
  const db = new DatabaseSync(path);
  for (const migration of MIGRATIONS.slice(0, 2)) db.exec(migration.sql);
  db.exec("PRAGMA user_version=2; INSERT INTO tasks VALUES('pending','Keep pending','2026-11-03','pending','2026-11-03T00:00:00Z',NULL);");
  db.exec("INSERT INTO tasks VALUES('completed','Keep completed','2026-11-03','completed','2026-11-03T00:00:00Z','2026-11-03T01:00:00Z');");
  db.exec("INSERT INTO tasks VALUES('cancelled','Keep cancelled','2026-11-03','cancelled','2026-11-03T00:00:00Z','2026-11-03T02:00:00Z');");
  db.close();
  let store = await openWorkspaceStore(path, () => new Date(2026, 10, 4));
  try {
    assert.equal(store.tasks.view().due[0]?.id, 'pending');
    assert.equal(store.tasks.view().due[0]?.recurrenceId, null);
    assert.deepEqual(store.tasks.view().history.map(task => task.id), ['cancelled', 'completed']);
    assert.equal(store.tasks.view().history[1]?.resolvedAt, '2026-11-03T01:00:00Z');
    store.tasks.addRecurrence({ title: 'New rule', plannedDate: '2026-11-04', frequency: 'daily' });
  } finally { store.close(); }
  const files = await readdir(join(directory, 'backups'));
  const snapshot = files.find(name => name.endsWith('.db'))!;
  const restoredPath = join(directory, 'schema2.db');
  const before = await readFile(path);
  await restoreSnapshot(join(directory, 'backups', snapshot), restoredPath);
  const restored = new DatabaseSync(restoredPath, { readOnly: true });
  try {
    assert.equal(restored.prepare('PRAGMA user_version').get()?.user_version, 2);
    assert.equal(restored.prepare('SELECT COUNT(*) AS count FROM tasks').get()?.count, 3);
  } finally { restored.close(); }
  assert.deepEqual(await readFile(path), before);
  store = await openWorkspaceStore(path);
  store.close();
  assert.deepEqual(await readdir(join(directory, 'backups')), files);
  const current = new DatabaseSync(path, { readOnly: true });
  try { assert.equal(current.prepare('PRAGMA user_version').get()?.user_version, SCHEMA_VERSION); }
  finally { current.close(); }
});

test('schema 2 backup failure prevents recurrence migration', async t => {
  const { path, directory } = await fixture(t);
  const db = new DatabaseSync(path);
  for (const migration of MIGRATIONS.slice(0, 2)) db.exec(migration.sql);
  db.exec('PRAGMA user_version=2'); db.close();
  const before = await readFile(path);
  await writeFile(join(directory, 'backups'), 'prevent backup');
  await assert.rejects(openWorkspaceStore(path), /DATABASE_MIGRATION_FAILED/);
  assert.deepEqual(await readFile(path), before);
});

test('failed catch-up rolls back occurrences and the schedule cursor together', async t => {
  const { path } = await fixture(t);
  let now = new Date(2026, 10, 4);
  const store = await openWorkspaceStore(path, () => now);
  try {
    store.tasks.addRecurrence({ title: 'Daily', plannedDate: '2026-11-04', frequency: 'daily' });
    const injector = new DatabaseSync(path);
    try { injector.exec("CREATE TRIGGER fail_catchup BEFORE INSERT ON tasks WHEN NEW.planned_date='2026-11-06' BEGIN SELECT RAISE(ABORT,'injected failure'); END;"); }
    finally { injector.close(); }
    now = new Date(2026, 10, 7);
    assert.throws(() => store.tasks.view(), /injected failure/);
    const reader = new DatabaseSync(path);
    try {
      assert.equal(reader.prepare('SELECT COUNT(*) AS count FROM tasks').get()?.count, 1);
      assert.equal(reader.prepare('SELECT status FROM tasks').get()?.status, 'pending');
      assert.equal(reader.prepare('SELECT next_date FROM recurrence_rules').get()?.next_date, '2026-11-05');
      reader.exec('DROP TRIGGER fail_catchup');
    } finally { reader.close(); }
    assert.equal(store.tasks.view().history.length, 3);
    assert.equal(store.tasks.view().due[0]?.plannedDate, '2026-11-07');
  } finally { store.close(); }
});

test('recurrence HTTP routes enforce boundaries and persist the stopped lifecycle', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'focusflow-recurrence-http-'));
  let now = new Date(2026, 10, 4);
  const app = await startWorkspaceServer({ dataDirectory: directory, clock: () => now });
  t.after(async () => {
    await app.close();
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
    assert.ok(basename(directory).startsWith('focusflow-recurrence-http-'));
    await rm(directory, { recursive: true, force: true });
  });
  const post = (path: string, value: unknown, origin = app.origin) => fetch(app.origin + path, {
    method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(value),
  });
  const input = { title: 'API repeat', plannedDate: '2026-11-04', frequency: 'daily' };
  assert.equal((await post('/api/recurrences', input, 'https://other.example')).status, 403);
  assert.equal((await post('/api/recurrences', { ...input, frequency: 'monthly' })).status, 400);
  const response = await post('/api/recurrences', input);
  assert.equal(response.status, 201);
  const { rule, view } = await response.json() as { rule: RecurrenceRule; view: TaskView };
  now = new Date(2026, 10, 5);
  assert.equal((await post(`/api/tasks/${view.due[0]!.id}/resolve`, { status: 'completed' })).status, 400);
  const rolled = await (await fetch(app.origin + '/api/tasks')).json() as TaskView;
  assert.equal(rolled.due[0]?.plannedDate, '2026-11-05');
  assert.equal(rolled.history[0]?.status, 'missed');
  const url = `/api/recurrences/${rule.id}/stop`;
  assert.equal((await post(url, {}, 'https://other.example')).status, 403);
  assert.equal((await post(url, {})).status, 200);
  assert.equal((await post(url, {})).status, 200);
  assert.equal((await post('/api/recurrences/00000000-0000-0000-0000-000000000000/stop', {})).status, 404);
  now = new Date(2026, 10, 7);
  const stopped = await (await fetch(app.origin + '/api/tasks')).json() as TaskView;
  assert.equal(stopped.recurrences.length + stopped.due.length, 0);
  assert.equal(stopped.history.length, 2);
});
