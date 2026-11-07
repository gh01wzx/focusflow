import test from 'node:test';
import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { selectProfile } from '../src/runtime/profile.ts';
import { openWorkspaceStore } from '../src/workspace/store.ts';
import { startWorkspaceServer } from '../src/workspace/server.ts';
import { MIGRATIONS, SCHEMA_VERSION } from '../src/database/schema.ts';
import { TICKET_STATUSES } from '../src/shared/projects.ts';
import { projectActions } from '../src/shared/actions.ts';

async function fixture(t: TestContext) {
  const root = await mkdtemp(join(tmpdir(), 'focusflow-profiles-'));
  t.after(async () => {
    assert.equal(dirname(resolve(root)), resolve(tmpdir()));
    assert.ok(basename(root).startsWith('focusflow-profiles-'));
    await rm(root, { recursive: true, force: true });
  });
  return root;
}

function profile(root: string, packaged = false, args: string[] = [], schemaVersion = SCHEMA_VERSION) {
  return selectProfile({ packaged, args, localDataDirectory: root, checkoutDirectory: join(root, 'checkout'), schemaVersion });
}
const database = (directory: string) => join(directory, 'data', 'tracker.db');
const now = () => new Date(2026, 10, 5, 12);

test('default source, named review and installed data stay separate and reopen deterministically', async t => {
  const root = await fixture(t);
  const everyday = profile(root, true);
  assert.equal(everyday.directory, join(root, 'FocusFlow', 'desktop'));
  assert.equal(everyday.sampleLabel, null);
  const development = profile(root);
  const review = profile(root, true, ['--review', 'PR-72']);
  assert.equal(development.sampleLabel, 'Development');
  assert.equal(review.sampleLabel, 'Review pr-72');
  assert.equal(new Set([everyday.directory, development.directory, review.directory]).size, 3);
  assert.deepEqual(profile(root), development);
  assert.deepEqual(profile(root, false, ['--review', 'pr-72']), review);
  assert.notEqual(profile(root, false, ['--review', 'pr-73']).directory, review.directory);
  assert.notEqual(selectProfile({ packaged: false, args: [], localDataDirectory: root,
    checkoutDirectory: join(root, 'another-checkout'), schemaVersion: SCHEMA_VERSION }).directory, development.directory);
  assert.notEqual(profile(root, false, [], SCHEMA_VERSION + 1).directory, development.directory);
  assert.notEqual(profile(root, true, ['--review', 'pr-72'], SCHEMA_VERSION + 1).directory, review.directory);
  assert.equal(profile(root, true, ['--review']).sampleLabel, 'Review local');
});

test('review names cannot select arbitrary paths or silently use an inherited test override', async t => {
  const root = await fixture(t);
  for (const name of ['', '..', '../desktop', 'a/b', 'a\\b', 'x:y', 'two words', '--other', 'a'.repeat(49)]) {
    assert.throws(() => profile(root, true, ['--review', name]), /review name/);
  }
  assert.throws(() => selectProfile({ packaged: true, args: ['--review', 'pr-72'], localDataDirectory: root,
    checkoutDirectory: root, schemaVersion: SCHEMA_VERSION, testProfile: join(root, 'test') }), /Clear FOCUSFLOW_TEST_PROFILE/);
  const custom = selectProfile({ packaged: true, args: [], localDataDirectory: root,
    checkoutDirectory: root, schemaVersion: SCHEMA_VERSION, testProfile: join(root, 'test') });
  assert.deepEqual(custom, { directory: join(root, 'test'), sampleLabel: null });
});

test('sample edits survive reopening without re-seeding or changing everyday data', async t => {
  const root = await fixture(t);
  const everyday = database(profile(root, true).directory);
  let personal = await openWorkspaceStore(everyday, now);
  personal.tasks.add({ title: 'Everyday sentinel', plannedDate: '2026-11-05' });
  personal.close();
  const original = await readFile(everyday);
  const sample = database(profile(root, true, ['--review', 'pr-72']).directory);
  let store = await openWorkspaceStore(sample, now, true);
  const first = store.tasks.view();
  assert.equal(first.due.length, 2);
  assert.equal(first.upcoming.length, 1);
  assert.equal(first.recurrences.length, 1);
  const examples = store.projects.view();
  assert.equal(examples.milestones.length, 3);
  assert.equal(examples.tickets.length, 12);
  for (const status of TICKET_STATUSES) assert.equal(examples.tickets.filter(ticket => ticket.status === status).length, 2);
  assert.ok(examples.tickets.every(ticket => ticket.executionMode === 'manual' && ticket.description && ticket.acceptanceCriteria));
  assert.equal(examples.dependencies.length, 4);
  assert.ok(examples.dependencies.every(link => examples.tickets.find(ticket => ticket.id === link.ticketId)!.milestoneId
    !== examples.tickets.find(ticket => ticket.id === link.prerequisiteId)!.milestoneId));
  const dependent = examples.tickets.find(ticket => ticket.title === 'Start after the demo goal is done')!;
  assert.throws(() => store.projects.start(dependent.id), /prerequisites/);
  assert.equal(projectActions(store.projects.actions()).next?.ticket.title, 'Move this sample ticket');
  const task = first.due.find(value => value.recurrenceId === null)!;
  store.tasks.resolve(task.id, 'completed');
  store.tasks.add({ title: 'My review task', plannedDate: '2026-11-05' });
  const ticket = examples.tickets.find(ticket => ticket.title === 'Move this sample ticket')!;
  store.projects.setStatus(ticket.id, 'done');
  const saved = store.tasks.view();
  const projects = store.projects.view();
  store.close();
  store = await openWorkspaceStore(sample, now, true);
  try {
    assert.deepEqual(store.tasks.view(), saved);
    assert.deepEqual(store.projects.view(), projects);
    assert.equal(store.tasks.view().history.find(value => value.id === task.id)?.status, 'completed');
  } finally { store.close(); }
  assert.deepEqual(await readFile(everyday), original);
  personal = await openWorkspaceStore(everyday, now);
  try {
    assert.deepEqual(personal.tasks.view().due.map(value => value.title), ['Everyday sentinel']);
    assert.equal(personal.projects.view().projects.length, 0);
  } finally { personal.close(); }
});

test('older and newer review formats remain untouched; migration needs an explicit separate copy', async t => {
  const root = await fixture(t);
  const args = ['--review', 'version-trial'];
  const old = database(profile(root, true, args, 4).directory);
  await mkdir(dirname(old), { recursive: true });
  const db = new DatabaseSync(old);
  for (const migration of MIGRATIONS.slice(0, 4)) db.exec(migration.sql);
  db.exec('PRAGMA user_version=4');
  db.prepare('INSERT INTO tasks VALUES(?,?,?,?,?,?,?)')
    .run('old', 'Keep the old review', '2026-11-05', 'pending', now().toISOString(), null, null);
  db.close();
  const before = await readFile(old);
  const newer = database(profile(root, true, args, SCHEMA_VERSION + 1).directory);
  await mkdir(dirname(newer), { recursive: true });
  const future = new DatabaseSync(newer);
  future.exec(`PRAGMA user_version=${SCHEMA_VERSION + 1}`); future.close();
  const futureBytes = await readFile(newer);
  const current = database(profile(root, true, args).directory);
  const sample = await openWorkspaceStore(current, now, true); sample.close();
  assert.deepEqual(await readFile(old), before);
  assert.deepEqual(await readFile(newer), futureBytes);
  const oldReader = new DatabaseSync(old, { readOnly: true });
  try { assert.equal(oldReader.prepare('PRAGMA user_version').get()?.user_version, 4); }
  finally { oldReader.close(); }

  const trial = database(profile(root, true, ['--review', 'migration-copy']).directory);
  await mkdir(dirname(trial), { recursive: true });
  await copyFile(old, trial);
  const migrated = await openWorkspaceStore(trial, now, true);
  try {
    assert.deepEqual(migrated.tasks.view().due.map(value => value.title), ['Keep the old review']);
    assert.equal(migrated.projects.view().projects.length, 0, 'Existing copies must never receive examples.');
  } finally { migrated.close(); }
  assert.deepEqual(await readFile(old), before);
  assert.equal((await readdir(join(dirname(trial), 'backups'))).filter(name => name.endsWith('.db')).length, 1);
});

test('sample notice and title are escaped and absent from the everyday page', async t => {
  const root = await fixture(t);
  const sample = await startWorkspaceServer({ dataDirectory: join(root, 'sample'), clock: now, sampleLabel: '<script>Review</script>' });
  const personal = await startWorkspaceServer({ dataDirectory: join(root, 'everyday'), clock: now });
  try {
    const html = await (await fetch(sample.origin)).text();
    assert.match(html, /role="note"/);
    assert.match(html, /<strong>Sample data<\/strong>/);
    assert.match(html, /&lt;script&gt;Review&lt;\/script&gt;/);
    assert.doesNotMatch(html, /<script>Review/);
    assert.match(html, /<title>FocusFlow - &lt;script&gt;Review/);
    const ordinary = await (await fetch(personal.origin)).text();
    assert.doesNotMatch(ordinary, /sample-notice|sample-data-notice|Everyday tasks are separate/);
    assert.match(ordinary, /<title>FocusFlow<\/title>/);
  } finally { await sample.close(); await personal.close(); }
});
