import test from 'node:test';
import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { firstSelectedDate, nextScheduledDate } from '../src/shared/weekdays.ts';
import { openWorkspaceStore } from '../src/workspace/store.ts';
import { createTaskClient } from '../src/client/tasks.ts';
import { startWorkspaceServer } from '../src/workspace/server.ts';
import { MIGRATIONS, SCHEMA_VERSION } from '../src/database/schema.ts';
import { migrateDatabase } from '../src/database/migrate.ts';
import { restoreSnapshot } from '../src/database/backup.ts';

async function fixture(t: TestContext) {
  const directory = await mkdtemp(join(tmpdir(), 'focusflow-weekdays-'));
  t.after(async () => {
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
    assert.ok(basename(directory).startsWith('focusflow-weekdays-'));
    await rm(directory, { recursive: true, force: true });
  });
  return { directory, path: join(directory, 'tracker.db') };
}

test('weekday calendar selects dates across weeks, leap days and the supported upper bound', () => {
  assert.equal(firstSelectedDate('2026-11-04', [1, 2, 6]), '2026-11-07');
  assert.equal(nextScheduledDate('2026-11-07', 'weekly', [1, 2, 6]), '2026-11-09');
  assert.equal(nextScheduledDate('2026-11-09', 'weekly', [1, 2, 6]), '2026-11-10');
  assert.equal(firstSelectedDate('2028-02-28', [2]), '2028-02-29');
  assert.equal(nextScheduledDate('2026-12-31', 'weekly', [5]), '2027-01-01');
  assert.equal(firstSelectedDate('9999-12-31', [6]), null);
  assert.equal(nextScheduledDate('9999-12-31', 'weekly', [5]), null);
});

test('selected weekdays, daily work and overdue temporary tasks survive gaps and restarts together', async t => {
  const { path } = await fixture(t);
  let now = new Date(2026, 10, 2, 23, 59);
  let store = await openWorkspaceStore(path, () => now);
  try {
    const weekly = store.tasks.addRecurrence({ title: 'Chores', plannedDate: '2026-11-02', frequency: 'weekly', weekdays: [6, 2, 1] });
    store.tasks.addRecurrence({ title: 'Daily', plannedDate: '2026-11-02', frequency: 'daily' });
    const temporary = store.tasks.add({ title: 'Call back', plannedDate: '2026-11-01' });
    const first = store.tasks.view().due.find(task => task.recurrenceId === weekly.id)!;
    store.tasks.resolve(first.id, 'completed');
    assert.deepEqual(weekly.weekdays, [1, 2, 6]);
    now = new Date(2026, 10, 3, 0, 1);
    const tuesday = store.tasks.view().due.find(task => task.recurrenceId === weekly.id)!;
    assert.equal(tuesday.plannedDate, '2026-11-03');
    assert.notEqual(tuesday.id, first.id);
    store.close(); now = new Date(2026, 10, 4); store = await openWorkspaceStore(path, () => now);
    const wednesday = store.tasks.view();
    assert.equal(wednesday.due.filter(task => task.recurrenceId === weekly.id).length, 0);
    assert.equal(wednesday.history.find(task => task.id === tuesday.id)?.status, 'missed');
    assert.equal(wednesday.due.find(task => task.id === temporary.id)?.plannedDate, '2026-11-01');
    assert.equal(wednesday.due.find(task => task.frequency === 'daily')?.plannedDate, '2026-11-04');
    store.close(); now = new Date(2026, 10, 14); store = await openWorkspaceStore(path, () => now);
    const caughtUp = store.tasks.view();
    assert.deepEqual(caughtUp.history.filter(task => task.recurrenceId === weekly.id).map(task => task.plannedDate).sort(),
      ['2026-11-02', '2026-11-03', '2026-11-07', '2026-11-09', '2026-11-10']);
    assert.equal(caughtUp.history.find(task => task.id === first.id)?.status, 'completed');
    assert.equal(caughtUp.due.find(task => task.recurrenceId === weekly.id)?.plannedDate, '2026-11-14');
    assert.deepEqual(store.tasks.view(), caughtUp);
    store.close(); store = await openWorkspaceStore(path, () => now);
    assert.deepEqual(store.tasks.view(), caughtUp);
  } finally { store.close(); }
});

test('first selected date, cancellation, stopping and clock rollback do not create extra work', async t => {
  const { path } = await fixture(t);
  let now = new Date(2026, 10, 4);
  const store = await openWorkspaceStore(path, () => now);
  try {
    const rule = store.tasks.addRecurrence({ title: 'Weekend', plannedDate: '2026-11-04', frequency: 'weekly', weekdays: [6] });
    assert.equal(store.tasks.view().upcoming[0]?.plannedDate, '2026-11-07');
    now = new Date(2026, 10, 7);
    const task = store.tasks.view().due[0]!;
    store.tasks.resolve(task.id, 'cancelled');
    now = new Date(2026, 10, 8);
    assert.equal(store.tasks.view().due.length, 0);
    now = new Date(2026, 10, 7);
    assert.equal(store.tasks.view().due.length, 0);
    now = new Date(2026, 10, 14);
    assert.equal(store.tasks.view().due[0]?.plannedDate, '2026-11-14');
    store.tasks.stopRecurrence(rule.id);
    assert.equal(store.tasks.view().due.length, 1);
    now = new Date(2026, 10, 15);
    assert.equal(store.tasks.view().due.length, 0);
    assert.deepEqual(store.tasks.view().history.map(task => task.status).sort(), ['cancelled', 'missed']);
  } finally { store.close(); }
});

test('invalid weekdays are rejected atomically, including a schedule beyond the last supported date', async t => {
  const { path } = await fixture(t);
  const store = await openWorkspaceStore(path, () => new Date(2026, 10, 4));
  try {
    for (const weekdays of [undefined, null, [], [1, 1], [-1], [7], [1.5], ['1'], 'Mon', [true]]) {
      assert.throws(() => store.tasks.addRecurrence({ title: 'Bad', plannedDate: '2026-11-04', frequency: 'weekly', weekdays }));
    }
    assert.throws(() => store.tasks.addRecurrence({ title: 'Bad', plannedDate: '2026-11-04', frequency: 'daily', weekdays: [1] }));
    assert.throws(() => store.tasks.addRecurrence({ title: 'Too late', plannedDate: '9999-12-31', frequency: 'weekly', weekdays: [6] }), /supported date range/);
    assert.equal(store.tasks.view().recurrences.length + store.tasks.view().upcoming.length, 0);
  } finally { store.close(); }
});

test('weekday schedules follow Auckland local dates across DST without duplicate Sundays', async t => {
  const { path } = await fixture(t);
  const previous = process.env.TZ; process.env.TZ = 'Pacific/Auckland';
  let now = new Date('2026-09-26T11:30:00Z');
  const store = await openWorkspaceStore(path, () => now);
  try {
    store.tasks.addRecurrence({ title: 'Sunday chores', plannedDate: '2026-09-26', frequency: 'weekly', weekdays: [0] });
    assert.equal(store.tasks.view().upcoming[0]?.plannedDate, '2026-09-27');
    now = new Date('2026-09-26T12:30:00Z');
    const sunday = store.tasks.view().due[0]!;
    now = new Date('2026-09-26T14:30:00Z');
    assert.equal(store.tasks.view().due[0]?.id, sunday.id);
    now = new Date('2026-09-27T11:01:00Z');
    assert.equal(store.tasks.view().due.length, 0);
    assert.equal(store.tasks.view().history[0]?.plannedDate, '2026-09-27');
  } finally {
    store.close();
    if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous;
  }
});

function schema4(path: string): void {
  const db = new DatabaseSync(path);
  try {
    for (const migration of MIGRATIONS.slice(0, 4)) db.exec(migration.sql);
    db.exec(`PRAGMA user_version=4;
      INSERT INTO recurrence_rules VALUES('old','Legacy weekly','weekly','2026-11-04','2026-11-11','2026-11-04T00:00:00Z',NULL);
      INSERT INTO tasks VALUES('old-task','Legacy weekly','2026-11-04','pending','2026-11-04T00:00:00Z',NULL,'old');
      INSERT INTO projects VALUES('project','Keep project','','2026-11-04T00:00:00Z');`);
  } finally { db.close(); }
}

test('schema 4 migration keeps legacy weekly behavior and a restorable unchanged backup', async t => {
  const { path, directory } = await fixture(t);
  schema4(path);
  const store = await openWorkspaceStore(path, () => new Date(2026, 10, 10));
  try {
    assert.equal(store.tasks.view().due[0]?.id, 'old-task');
    assert.equal(store.tasks.view().recurrences[0]?.weekdays, null);
    assert.equal(store.projects.view().projects[0]?.title, 'Keep project');
    store.tasks.addRecurrence({ title: 'New days', plannedDate: '2026-11-10', frequency: 'weekly', weekdays: [2] });
  } finally { store.close(); }
  const snapshots = (await readdir(join(directory, 'backups'))).filter(name => name.endsWith('.db'));
  assert.equal(snapshots.length, 1);
  const before = await readFile(path);
  const restored = join(directory, 'schema4-restored.db');
  await restoreSnapshot(join(directory, 'backups', snapshots[0]!), restored);
  const reader = new DatabaseSync(restored, { readOnly: true });
  try {
    assert.equal(reader.prepare('PRAGMA user_version').get()?.user_version, 4);
    assert.equal(reader.prepare('SELECT id FROM tasks').get()?.id, 'old-task');
    assert.equal(reader.prepare('SELECT id FROM projects').get()?.id, 'project');
  } finally { reader.close(); }
  assert.deepEqual(await readFile(path), before);
});

test('schema 5 backup failure blocks migration and SQL rejects malformed weekday masks', async t => {
  const { path, directory } = await fixture(t);
  schema4(path);
  const before = await readFile(path);
  await writeFile(join(directory, 'backups'), 'block snapshots');
  await assert.rejects(openWorkspaceStore(path), /DATABASE_MIGRATION_FAILED/);
  assert.deepEqual(await readFile(path), before);
  await rm(join(directory, 'backups'));
  const db = new DatabaseSync(path);
  try {
    await assert.rejects(migrateDatabase(db, path, [...MIGRATIONS.slice(0, 4),
      { version: 5, sql: MIGRATIONS[4].sql + ' INSERT INTO missing_table VALUES(1);' }]), /DATABASE_MIGRATION_FAILED/);
    assert.equal(db.prepare('PRAGMA user_version').get()?.user_version, 4);
  } finally { db.close(); }
  const store = await openWorkspaceStore(path); store.close();
  const writer = new DatabaseSync(path);
  try {
    assert.equal(writer.prepare('PRAGMA user_version').get()?.user_version, SCHEMA_VERSION);
    for (const mask of [0, 128, -1, 1.5, 'bad']) {
      assert.throws(() => writer.prepare('UPDATE recurrence_rules SET weekdays_mask=?').run(mask), /CHECK/);
    }
  } finally { writer.close(); }
});

test('the browser client sends weekday choices to the real API and reads them back', async t => {
  const { directory } = await fixture(t);
  let now = new Date(2026, 10, 4);
  const server = await startWorkspaceServer({ dataDirectory: directory, clock: () => now });
  try {
    const client = createTaskClient((path, options) => fetch(server.origin + String(path), {
      ...options, headers: { ...options?.headers, Origin: server.origin },
    }));
    const created = await client.add({ title: 'Chores', plannedDate: '2026-11-04', frequency: 'weekly', weekdays: [1, 2, 6] });
    assert.deepEqual(created.recurrences[0]?.weekdays, [1, 2, 6]);
    assert.equal(created.upcoming[0]?.plannedDate, '2026-11-07');
    now = new Date(2026, 10, 7);
    assert.equal((await client.read()).due[0]?.title, 'Chores');
    now = new Date(2026, 10, 8);
    assert.equal((await client.read()).due.length, 0);
  } finally { await server.close(); }
});
