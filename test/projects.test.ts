import test from 'node:test';
import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openWorkspaceStore } from '../src/workspace/store.ts';
import { startWorkspaceServer } from '../src/workspace/server.ts';
import { MIGRATIONS, SCHEMA_VERSION } from '../src/database/schema.ts';
import { migrateDatabase } from '../src/database/migrate.ts';
import { restoreSnapshot } from '../src/database/backup.ts';
import { createProjectClient } from '../src/client/projects.ts';
import { TICKET_STATUSES } from '../src/shared/projects.ts';
import { ProjectInputError, ProjectNotFoundError } from '../src/projects/validation.ts';

async function fixture(t: TestContext) {
  const directory = await mkdtemp(join(tmpdir(), 'focusflow-project-test-'));
  t.after(async () => {
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
    assert.ok(basename(directory).startsWith('focusflow-project-test-'));
    await rm(directory, { recursive: true, force: true });
  });
  return { directory, path: join(directory, 'tracker.db') };
}

test('project hierarchy, manual statuses and original text persist separately from Personal', async t => {
  const { path } = await fixture(t);
  let now = new Date(2026, 10, 4);
  let store = await openWorkspaceStore(path, () => now);
  try {
    const personal = store.tasks.add({ title: 'Private Personal task', plannedDate: '2026-11-04' });
    const first = store.projects.addProject({ title: 'Same name', description: 'First project' });
    const second = store.projects.addProject({ title: 'Same name', description: 'Second project' });
    const a = store.projects.addMilestone({ projectId: first.id, title: 'First milestone' });
    const b = store.projects.addMilestone({ projectId: second.id, title: 'Second milestone' });
    const unicode = '\u9879\u76ee <img src=x onerror=alert(1)> "); DROP TABLE projects; --';
    const ticket = store.projects.addTicket({ milestoneId: a.id, title: unicode,
      description: 'Line one\nLine two', acceptanceCriteria: 'Keep the original text.\nRetain history.' });
    store.projects.addTicket({ milestoneId: b.id, title: 'Other project ticket' });
    assert.equal(ticket.executionMode, 'manual');
    assert.equal(ticket.status, 'backlog');
    for (const status of TICKET_STATUSES) {
      now = new Date(now.getTime() + 1000);
      store.projects.setStatus(ticket.id, status);
      assert.equal(store.projects.view(first.id).tickets[0]?.status, status);
    }
    const changed = store.projects.view(first.id).tickets[0]!;
    now = new Date(now.getTime() + 1000);
    store.projects.setStatus(ticket.id, changed.status);
    assert.equal(store.projects.view(first.id).tickets[0]?.updatedAt, changed.updatedAt);
    const expected = store.projects.view(first.id);
    assert.deepEqual(expected.milestones.map(item => item.id), [a.id]);
    assert.deepEqual(expected.tickets.map(item => item.id), [ticket.id]);
    assert.equal(expected.tickets[0]?.title, unicode);
    assert.equal(store.projects.view(second.id).tickets[0]?.title, 'Other project ticket');
    store.close(); store = await openWorkspaceStore(path, () => now);
    assert.deepEqual(store.projects.view(first.id), expected);
    assert.equal(store.tasks.view().due[0]?.id, personal.id);
    assert.equal(store.tasks.view().due.length, 1);
  } finally { store.close(); }
});

test('invalid titles, parents, status and coding modes create no project records', async t => {
  const { path } = await fixture(t);
  const store = await openWorkspaceStore(path);
  try {
    for (const input of [null, {}, { title: ' ' }, { title: 'x'.repeat(301) },
      { title: 'Bad', description: 42 }, { title: 'Bad', description: 'x'.repeat(2001) }]) {
      assert.throws(() => store.projects.addProject(input), ProjectInputError);
    }
    const project = store.projects.addProject({ title: 'Valid' });
    const milestone = store.projects.addMilestone({ projectId: project.id, title: 'Valid milestone' });
    const missing = '00000000-0000-0000-0000-000000000000';
    assert.throws(() => store.projects.addMilestone({ projectId: missing, title: 'Missing' }), ProjectNotFoundError);
    assert.throws(() => store.projects.addTicket({ milestoneId: missing, title: 'Missing' }), ProjectNotFoundError);
    assert.throws(() => store.projects.addTicket({ milestoneId: milestone.id, title: 'Coding', executionMode: 'codex' }), ProjectInputError);
    assert.throws(() => store.projects.addTicket({ milestoneId: milestone.id, title: 'Too long', acceptanceCriteria: 'x'.repeat(2001) }), ProjectInputError);
    assert.throws(() => store.projects.setStatus(missing, 'done'), ProjectNotFoundError);
    assert.throws(() => store.projects.view(missing), ProjectNotFoundError);
    const ticket = store.projects.addTicket({ milestoneId: milestone.id, title: 'Valid ticket' });
    assert.throws(() => store.projects.setStatus(ticket.id, 'completed'), ProjectInputError);
    assert.equal(store.projects.view().projects.length, 1);
    assert.equal(store.projects.view().tickets.length, 1);
    assert.equal(store.projects.view().tickets[0]?.status, 'backlog');
  } finally { store.close(); }
});

test('manual snapshot preserves the project hierarchy independently of later status changes', async t => {
  const { path, directory } = await fixture(t);
  const store = await openWorkspaceStore(path);
  try {
    const project = store.projects.addProject({ title: 'In the backup' });
    const milestone = store.projects.addMilestone({ title: 'Milestone', projectId: project.id });
    const ticket = store.projects.addTicket({ title: 'Ticket', milestoneId: milestone.id, acceptanceCriteria: 'Keep this.' });
    const expected = store.projects.view(project.id);
    const snapshot = await store.snapshot();
    store.projects.setStatus(ticket.id, 'done');
    const target = join(directory, 'project-restored.db');
    await restoreSnapshot(snapshot.path, target);
    const restored = await openWorkspaceStore(target);
    try { assert.deepEqual(restored.projects.view(project.id), expected); }
    finally { restored.close(); }
    assert.equal(store.projects.view(project.id).tickets[0]?.status, 'done');
  } finally { store.close(); }
});

function schema3(path: string) {
  const db = new DatabaseSync(path);
  for (const migration of MIGRATIONS.slice(0, 3)) db.exec(migration.sql);
  db.exec("PRAGMA user_version=3; INSERT INTO tasks VALUES('personal','Keep Personal','2026-11-04','pending','2026-11-04T00:00:00Z',NULL,NULL);");
  db.exec("INSERT INTO recurrence_rules VALUES('rule','Daily task','daily','2026-11-04','2026-11-05','2026-11-04T00:00:00Z',NULL);");
  db.exec("INSERT INTO tasks VALUES('occurrence','Daily task','2026-11-04','completed','2026-11-04T00:00:00Z','2026-11-04T01:00:00Z','rule');");
  return db;
}

test('schema 3 upgrade preserves Personal tasks and repeats with one restorable pre-upgrade snapshot', async t => {
  const { path, directory } = await fixture(t);
  schema3(path).close();
  let store = await openWorkspaceStore(path, () => new Date(2026, 10, 4));
  const personal = store.tasks.view();
  try {
    assert.equal(personal.due[0]?.id, 'personal');
    assert.equal(personal.history[0]?.status, 'completed');
    assert.equal(personal.recurrences[0]?.nextDate, '2026-11-05');
    const project = store.projects.addProject({ title: 'New project' });
    const milestone = store.projects.addMilestone({ title: 'New milestone', projectId: project.id });
    store.projects.addTicket({ title: 'New ticket', milestoneId: milestone.id });
    assert.deepEqual(store.tasks.view(), personal);
  } finally { store.close(); }
  const files = await readdir(join(directory, 'backups'));
  const snapshot = files.find(name => name.endsWith('.db'))!;
  assert.equal(files.filter(name => name.endsWith('.db')).length, 1);
  const before = await readFile(path);
  const target = join(directory, 'schema3-restored.db');
  await restoreSnapshot(join(directory, 'backups', snapshot), target);
  const reader = new DatabaseSync(target, { readOnly: true });
  try {
    assert.equal(reader.prepare('PRAGMA user_version').get()?.user_version, 3);
    assert.equal(reader.prepare('SELECT COUNT(*) AS count FROM tasks').get()?.count, 2);
    assert.equal(reader.prepare('SELECT next_date FROM recurrence_rules').get()?.next_date, '2026-11-05');
    assert.equal(reader.prepare("SELECT name FROM sqlite_schema WHERE name='projects'").get(), undefined);
  } finally { reader.close(); }
  assert.deepEqual(await readFile(path), before);
  store = await openWorkspaceStore(path, () => new Date(2026, 10, 4));
  try { assert.deepEqual(store.tasks.view(), personal); assert.equal(store.projects.view().tickets.length, 1); }
  finally { store.close(); }
  assert.deepEqual(await readdir(join(directory, 'backups')), files);
});

test('backup failure prevents schema 4 and failed project migration rolls back all new tables', async t => {
  const { path, directory } = await fixture(t);
  schema3(path).close();
  const before = await readFile(path);
  await writeFile(join(directory, 'backups'), 'blocked');
  await assert.rejects(openWorkspaceStore(path), /DATABASE_MIGRATION_FAILED/);
  assert.deepEqual(await readFile(path), before);
  await rm(join(directory, 'backups'));
  const db = new DatabaseSync(path);
  try {
    const migration = MIGRATIONS[3];
    await assert.rejects(migrateDatabase(db, path, [...MIGRATIONS.slice(0, 3),
      { version: 4, sql: migration.sql + ' INSERT INTO missing_table VALUES(1);' }]), /DATABASE_MIGRATION_FAILED/);
    assert.equal(db.prepare('PRAGMA user_version').get()?.user_version, 3);
    assert.equal(db.prepare('SELECT title FROM tasks WHERE id=?').get('personal')?.title, 'Keep Personal');
    assert.equal(db.prepare("SELECT name FROM sqlite_schema WHERE name='projects'").get(), undefined);
  } finally { db.close(); }
});

test('project SQL constraints reject orphan parents and coding tickets', async t => {
  const { path } = await fixture(t);
  const store = await openWorkspaceStore(path);
  const project = store.projects.addProject({ title: 'Parent' });
  const milestone = store.projects.addMilestone({ title: 'Milestone', projectId: project.id });
  store.close();
  const db = new DatabaseSync(path);
  try {
    db.exec('PRAGMA foreign_keys=ON');
    assert.throws(() => db.exec("INSERT INTO milestones VALUES('orphan','missing','Orphan','','2026-11-04T00:00:00Z')"), /FOREIGN KEY/);
    assert.throws(() => db.prepare('INSERT INTO project_tickets(id,milestone_id,title,description,acceptance_criteria,status,execution_mode,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)').run(
      'coding', milestone.id, 'Coding', '', '', 'done', 'codex', '2026-11-04T00:00:00Z', '2026-11-04T00:00:00Z'), /CHECK/);
    assert.equal(db.prepare('PRAGMA user_version').get()?.user_version, SCHEMA_VERSION);
  } finally { db.close(); }
});

test('project client uses the real API, keeps project selection and enforces request boundaries', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'focusflow-project-http-'));
  const server = await startWorkspaceServer({ dataDirectory: directory });
  t.after(async () => {
    await server.close();
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
    assert.ok(basename(directory).startsWith('focusflow-project-http-'));
    await rm(directory, { recursive: true, force: true });
  });
  const client = createProjectClient((path, options) => fetch(server.origin + String(path), {
    ...options, headers: { ...options?.headers, Origin: server.origin },
  }));
  assert.deepEqual(await client.read(), { projects: [], selectedProjectId: null, milestones: [], tickets: [], dependencies: [] });
  await client.addProject({ title: 'First', description: '' });
  const second = await client.addProject({ title: 'Second', description: '\u9879'.repeat(2000) });
  const projectId = second.selectedProjectId!;
  const milestone = await client.addMilestone(projectId, { title: 'Second milestone', description: '' });
  const added = await client.addTicket({ title: 'Second ticket', description: '\u9879'.repeat(2000),
    acceptanceCriteria: '\u9a8c'.repeat(2000), milestoneId: milestone.milestones[0]!.id });
  assert.equal(added.selectedProjectId, projectId);
  const changed = await client.setStatus(added.tickets[0]!.id, 'done');
  assert.equal(changed.selectedProjectId, projectId);
  assert.equal(changed.tickets[0]?.status, 'done');
  assert.equal((await client.read(second.projects[0]!.id)).tickets.length, 0);
  assert.equal((await client.read(projectId)).tickets.length, 1);
  const post = (path: string, headers: Record<string, string>, body: string) => fetch(server.origin + path, { method: 'POST', headers, body });
  const headers = { Origin: server.origin, 'Content-Type': 'application/json' };
  assert.equal((await post('/api/projects', { ...headers, Origin: 'https://other.example' }, '{}')).status, 403);
  assert.equal((await post('/api/milestones', { 'Content-Type': 'application/json' }, '{}')).status, 403);
  assert.equal((await post('/api/projects', { ...headers, 'Content-Type': 'text/plain' }, '{}')).status, 415);
  assert.equal((await post('/api/project-tickets', headers, '{')).status, 400);
  assert.equal((await post('/api/project-tickets', headers, JSON.stringify({ title: 'x'.repeat(33000) }))).status, 413);
  assert.equal((await post('/api/tasks', headers, JSON.stringify({ title: 'x'.repeat(5000) }))).status, 413);
  assert.equal((await post('/api/project-tickets/00000000-0000-0000-0000-000000000000/status', headers, '{"status":"done"}')).status, 404);
  assert.equal((await fetch(server.origin + '/projects.css')).status, 200);
  assert.equal((await client.read(projectId)).tickets.length, 1);
});

test('project client rejects invalid nested data, foreign parents and unsupported execution modes', async () => {
  const project = { id: 'a', title: 'A', description: '', createdAt: '2026-11-04T00:00:00Z' };
  const milestone = { ...project, id: 'm', projectId: 'a' };
  const ticket = { id: 't', projectId: 'a', milestoneId: 'm', title: 'Ticket', description: '', acceptanceCriteria: '',
    status: 'backlog', blockReason: '', executionMode: 'manual', createdAt: project.createdAt, updatedAt: project.createdAt };
  const valid = { projects: [project], selectedProjectId: 'a', milestones: [milestone], tickets: [ticket], dependencies: [] };
  for (const payload of [null, { ...valid, selectedProjectId: 'missing' },
    { ...valid, milestones: [{ ...milestone, projectId: 'other' }] },
    { ...valid, tickets: [{ ...ticket, milestoneId: 'missing' }] },
    { ...valid, tickets: [{ ...ticket, executionMode: 'codex' }] },
    { ...valid, tickets: [{ ...ticket, status: 'completed' }] },
    { ...valid, projects: [{ ...project, title: {} }] }]) {
    await assert.rejects(createProjectClient(async () => new Response(JSON.stringify(payload))).read(), /Could not read your projects/);
  }
  assert.deepEqual(await createProjectClient(async () => new Response(JSON.stringify(valid))).read(), valid);
  await assert.rejects(createProjectClient(async () => new Response('<html>bad</html>')).read(), /Could not read your projects/);
  await assert.rejects(createProjectClient(async () => new Response('{"error":"Project not found."}', { status: 404 })).read(), /Project not found/);
});
