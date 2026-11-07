import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { MIGRATIONS, SCHEMA_VERSION } from '../src/database/schema.ts';
import { migrateDatabase } from '../src/database/migrate.ts';
import { restoreSnapshot, schemaVersion } from '../src/database/backup.ts';
import { openWorkspaceStore } from '../src/workspace/store.ts';
import { startWorkspaceServer } from '../src/workspace/server.ts';
import { createProjectClient } from '../src/client/projects.ts';
import { createActionClient } from '../src/client/actions.ts';
import { projectActions } from '../src/shared/actions.ts';
import { isTicketBlocked } from '../src/shared/dependencies.ts';
import { parseProjectView } from '../src/shared/project-codec.ts';

test('blockers are independent of four statuses, gate both starts, survive restart and clear explicitly', async t => {
  const root = await mkdtemp(join(tmpdir(), 'focusflow-blockers-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const path = join(root, 'tracker.db'); let store = await openWorkspaceStore(path);
  try {
    const project = store.projects.addProject({ title: 'Plan' });
    const milestone = store.projects.addMilestone({ projectId: project.id, title: 'Goal' });
    const ticket = store.projects.addTicket({ milestoneId: milestone.id, title: 'Blocked work' });
    store.projects.setBlocker(ticket.id, { reason: 'Waiting for feedback\n\u9879 <script>example</script>' });
    const blocked = store.projects.view();
    assert.equal(blocked.tickets[0]!.status, 'backlog');
    assert.equal(isTicketBlocked(blocked.tickets[0]!, blocked.tickets, blocked.dependencies), true);
    assert.equal(projectActions(store.projects.actions()).next, null);
    assert.throws(() => store.projects.start(ticket.id), /blocker/);
    assert.throws(() => store.projects.setStatus(ticket.id, 'in_progress'), /blocker/);
    for (const reason of [null, 3, 'x'.repeat(1001)]) assert.throws(() => store.projects.setBlocker(ticket.id, { reason }));
    for (const status of ['ready', 'blocked']) assert.throws(() => store.projects.setStatus(ticket.id, status));
    store.projects.setBlocker(ticket.id, { reason: blocked.tickets[0]!.blockReason });
    assert.deepEqual(store.projects.view(), blocked, 'Saving the same reason is idempotent.');
    store.projects.setStatus(ticket.id, 'review');
    assert.equal(store.projects.view().tickets[0]!.blockReason, blocked.tickets[0]!.blockReason);
    store.projects.setStatus(ticket.id, 'backlog');
    const saved = store.projects.view(); store.close(); store = await openWorkspaceStore(path);
    assert.deepEqual(store.projects.view(), saved);
    const input = store.projects.addTicket({ milestoneId: milestone.id, title: 'Needed input' });
    store.projects.setStatus(input.id, 'review');
    store.projects.setPrerequisites(ticket.id, { prerequisiteIds: [input.id] });
    store.projects.setBlocker(ticket.id, { reason: '' });
    assert.equal(store.projects.view().tickets[0]!.status, 'backlog');
    assert.equal(projectActions(store.projects.actions()).next, null, 'Clearing a manual reason does not clear prerequisite blockers.');
    store.projects.setStatus(input.id, 'done');
    assert.equal(projectActions(store.projects.actions()).next?.ticket.id, ticket.id);
    store.projects.start(ticket.id); assert.equal(store.projects.view().tickets[0]!.status, 'in_progress');
    store.projects.setBlocker(ticket.id, { reason: 'Waiting again' });
    assert.equal(store.projects.view().tickets[0]!.status, 'in_progress');
    store.projects.setStatus(ticket.id, 'done');
    const done = store.projects.view(); assert.equal(isTicketBlocked(done.tickets[0]!, done.tickets, done.dependencies), false);
    assert.throws(() => store.projects.setStatus(ticket.id, 'in_progress'), /blocker/);
  } finally { store.close(); }
});

test('blocker HTTP boundaries, checked responses and last Start checks preserve task status', async t => {
  const root = await mkdtemp(join(tmpdir(), 'focusflow-blockers-http-'));
  const server = await startWorkspaceServer({ dataDirectory: root });
  t.after(async () => { await server.close(); await rm(root, { recursive: true, force: true }); });
  const transport: typeof fetch = (path, options) => fetch(server.origin + String(path), { ...options, headers: { ...options?.headers, Origin: server.origin } });
  const client = createProjectClient(transport), actions = createActionClient(transport);
  let view = await client.addProject({ title: 'Test', description: '' });
  view = await client.addMilestone(view.selectedProjectId!, { title: 'Goal', description: '' });
  view = await client.addTicket({ title: 'Work', milestoneId: view.milestones[0]!.id, description: '', acceptanceCriteria: '' });
  const id = view.tickets[0]!.id;
  await client.setBlocker(id, 'Wait for input');
  assert.equal(projectActions(await actions.read()).next, null);
  await assert.rejects(actions.start(id), /blocker/);
  assert.equal((await fetch(server.origin + `/api/project-tickets/${id}/blocker`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"reason":"clear"}',
  })).status, 403);
  await assert.rejects(client.setBlocker(randomUUID(), 'missing'), /not found/);
  const before = await client.read();
  for (const reason of [false, null, 'x'.repeat(1001)]) {
    const result = await transport(`/api/project-tickets/${id}/blocker`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason }),
    }); assert.equal(result.status, 400);
  }
  assert.deepEqual(await client.read(), before);
  for (const blockReason of [undefined, 3, 'x'.repeat(1001)]) assert.throws(() => parseProjectView({ ...before, tickets: [{ ...before.tickets[0], blockReason }] }));
  view = await client.setBlocker(id, ''); assert.equal(view.tickets[0]!.status, 'backlog');
  assert.equal(projectActions(await actions.read()).next?.ticket.id, id);
  await actions.start(id); assert.equal((await client.read()).tickets[0]!.status, 'in_progress');
});

function prior(path: string, version: 6 | 7) {
  const db = new DatabaseSync(path); for (const migration of MIGRATIONS.slice(0, version)) db.exec(migration.sql);
  db.exec(`PRAGMA user_version=${version};
    INSERT INTO projects VALUES('p','Kept project','','2026-11-01');
    INSERT INTO milestones VALUES('m','p','Kept milestone','','2026-11-01');
    INSERT INTO tasks VALUES('personal','Private task','2026-11-07','pending','2026-11-01',NULL,NULL);
    INSERT INTO recurrence_rules VALUES('r','Weekly','weekly','2026-11-01','2026-11-09','2026-11-01',NULL,5);`);
  const statuses = ['backlog', 'ready', 'in_progress', 'review', 'done', 'blocked'];
  for (const status of statuses) db.prepare('INSERT INTO project_tickets VALUES(?,?,?,?,?,?,?,?,?)')
    .run(status, 'm', status, 'Keep description', 'Keep acceptance', status, 'manual', '2026-11-01', '2026-11-02');
  db.exec("INSERT INTO ticket_dependencies VALUES('ready','done'); INSERT INTO ticket_dependencies VALUES('blocked','backlog');");
  if (version === 7) db.exec(`INSERT INTO plan_drafts VALUES('p','{"fixture":"Preserve the published draft format"}');`);
  db.close(); return statuses;
}

test('schema 6 and published draft schema 7 upgrade with identities, dependencies, private data and restorable old statuses', async t => {
  const root = await mkdtemp(join(tmpdir(), 'focusflow-four-status-migrate-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const version of [6, 7] as const) {
    const path = join(root, String(version), 'tracker.db'); await import('node:fs/promises').then(fs => fs.mkdir(join(root, String(version))));
    const statuses = prior(path, version);
    const store = await openWorkspaceStore(path, () => new Date(2026, 10, 7));
    const view = store.projects.view(); assert.equal(view.tickets.length, 6);
    for (const ticket of view.tickets) {
      assert.equal(ticket.status, ['ready', 'blocked'].includes(ticket.id) ? 'backlog' : ticket.id);
      assert.equal(ticket.description, 'Keep description'); assert.equal(ticket.acceptanceCriteria, 'Keep acceptance');
      assert.equal(ticket.createdAt, '2026-11-01'); assert.equal(ticket.updatedAt, '2026-11-02');
      assert.equal(!!ticket.blockReason, ticket.id === 'blocked');
    }
    assert.equal(view.dependencies.length, 2); assert.throws(() => store.projects.start('blocked'), /blocker/);
    assert.equal(store.tasks.view().due.find(task => task.id === 'personal')?.title, 'Private task');
    store.close();
    const db = new DatabaseSync(path); db.exec('PRAGMA foreign_keys=ON');
    assert.equal(schemaVersion(db), SCHEMA_VERSION); assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
    assert.equal(db.prepare('SELECT weekdays_mask FROM recurrence_rules').get()?.weekdays_mask, 5);
    assert.throws(() => db.exec("UPDATE project_tickets SET status='ready'"), /CHECK/);
    assert.throws(() => db.exec("INSERT INTO ticket_dependencies VALUES('backlog','blocked')"), /cycle/);
    assert.throws(() => db.exec("INSERT INTO ticket_dependencies VALUES('backlog','missing')"), /FOREIGN KEY/);
    if (version === 7) assert.equal(db.prepare('SELECT draft_json FROM plan_drafts').get()?.draft_json, '{"fixture":"Preserve the published draft format"}');
    db.close();
    const snapshots = await readdir(join(root, String(version), 'backups'));
    const snapshot = snapshots.find(name => name.endsWith('.db'))!;
    const recovered = join(root, `recovered-${version}.db`); await restoreSnapshot(join(root, String(version), 'backups', snapshot), recovered);
    const original = new DatabaseSync(recovered);
    assert.equal(schemaVersion(original), version);
    assert.deepEqual(original.prepare('SELECT status FROM project_tickets ORDER BY rowid').all().map(row => row.status), statuses);
    assert.equal(original.prepare('SELECT count(*) AS count FROM ticket_dependencies').get()?.count, 2); original.close();
  }
});

test('backup failure prevents status conversion and a failed rebuild restores old tables and constraints', async t => {
  const root = await mkdtemp(join(tmpdir(), 'focusflow-four-status-failure-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const path = join(root, 'tracker.db'); prior(path, 7);
  await writeFile(join(root, 'backups'), 'blocked'); const before = await readFile(path);
  await assert.rejects(() => openWorkspaceStore(path)); assert.deepEqual(await readFile(path), before);
  await rm(join(root, 'backups'));
  const db = new DatabaseSync(path); db.exec('PRAGMA foreign_keys=ON');
  try {
    await assert.rejects(() => migrateDatabase(db, path, [...MIGRATIONS.slice(0, 7), { version: 8, sql: MIGRATIONS[7].sql + ' INSERT INTO missing_table VALUES(1);' }]));
    assert.equal(schemaVersion(db), 7); assert.equal(db.prepare("SELECT status FROM project_tickets WHERE id='blocked'").get()?.status, 'blocked');
    assert.equal(db.prepare("SELECT name FROM sqlite_schema WHERE name='next_project_tickets'").get(), undefined);
    assert.equal(db.prepare('SELECT count(*) AS count FROM ticket_dependencies').get()?.count, 2);
    assert.throws(() => db.exec("INSERT INTO ticket_dependencies VALUES('backlog','blocked')"), /cycle/);
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
  } finally { db.close(); }
});
