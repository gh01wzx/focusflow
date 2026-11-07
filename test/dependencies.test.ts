import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { openWorkspaceStore } from '../src/workspace/store.ts';
import { startWorkspaceServer } from '../src/workspace/server.ts';
import { createProjectClient } from '../src/client/projects.ts';
import { createActionClient } from '../src/client/actions.ts';
import { projectActions } from '../src/shared/actions.ts';
import { parseProjectView } from '../src/shared/project-codec.ts';
import { MIGRATIONS } from '../src/database/schema.ts';
import { restoreSnapshot } from '../src/database/backup.ts';

test('unfinished prerequisites control both recommendations and the last Start check without automatic status changes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'focusflow-deps-'));
  let store = await openWorkspaceStore(join(root, 'tracker.db'));
  try {
    const project = store.projects.addProject({ title: 'Plan' });
    const milestone = store.projects.addMilestone({ title: 'Goal', projectId: project.id });
    const a = store.projects.addTicket({ title: 'Use input', milestoneId: milestone.id });
    const b = store.projects.addTicket({ title: 'Prepare input', milestoneId: milestone.id });
    const c = store.projects.addTicket({ title: 'Check input', milestoneId: milestone.id });
    store.projects.setStatus(a.id, 'ready');
    store.projects.setPrerequisites(a.id, { prerequisiteIds: [b.id, c.id] });
    assert.equal(projectActions(store.projects.actions()).next, null);
    assert.throws(() => store.projects.start(a.id), /prerequisites/);
    assert.throws(() => store.projects.setStatus(a.id, 'in_progress'), /prerequisites/);
    store.projects.setStatus(b.id, 'done');
    assert.equal(projectActions(store.projects.actions()).next, null);
    store.projects.setStatus(c.id, 'done');
    assert.equal(projectActions(store.projects.actions()).next?.ticket.id, a.id);
    assert.equal(store.projects.view().tickets.find(t => t.id === a.id)?.status, 'ready');
    store.projects.setStatus(b.id, 'review');
    assert.throws(() => store.projects.start(a.id), /prerequisites/);
    store.projects.setStatus(b.id, 'done');
    store.projects.start(a.id);
    assert.equal(store.projects.view().tickets.find(t => t.id === a.id)?.status, 'in_progress');
    const before = store.projects.view();
    store.close(); store = await openWorkspaceStore(join(root, 'tracker.db'));
    assert.deepEqual(store.projects.view(), before);
    store.projects.setPrerequisites(a.id, { prerequisiteIds: [] });
    assert.equal(store.projects.view().dependencies.length, 0);
    store.projects.setStatus(a.id, 'blocked');
    assert.equal(projectActions(store.projects.actions()).next, null);
  } finally { store.close(); await rm(root, { recursive: true, force: true }); }
});

test('cycle, self, duplicate, missing and cross-project prerequisites are rejected atomically by service and SQL', async () => {
  const root = await mkdtemp(join(tmpdir(), 'focusflow-deps-invalid-'));
  const store = await openWorkspaceStore(join(root, 'tracker.db'));
  try {
    const p = store.projects.addProject({ title: 'One' });
    const m = store.projects.addMilestone({ title: 'Goal', projectId: p.id });
    const a = store.projects.addTicket({ title: 'A', milestoneId: m.id });
    const b = store.projects.addTicket({ title: 'B', milestoneId: m.id });
    const c = store.projects.addTicket({ title: 'C', milestoneId: m.id });
    const p2 = store.projects.addProject({ title: 'Two' });
    const m2 = store.projects.addMilestone({ title: 'Other', projectId: p2.id });
    const foreign = store.projects.addTicket({ title: 'Foreign', milestoneId: m2.id });
    store.projects.setPrerequisites(a.id, { prerequisiteIds: [b.id] });
    store.projects.setPrerequisites(b.id, { prerequisiteIds: [c.id] });
    const before = store.projects.view(p.id);
    for (const ids of [[c.id], [b.id, b.id], [foreign.id], [randomUUID()], [null]]) {
      assert.throws(() => store.projects.setPrerequisites(c.id, { prerequisiteIds: ids }));
      assert.deepEqual(store.projects.view(p.id), before);
    }
    assert.throws(() => store.projects.setPrerequisites(c.id, { prerequisiteIds: [a.id] }), /cycle/);
    assert.throws(() => store.projects.setPrerequisites(a.id, {}), /Choose/);
    assert.throws(() => store.projects.setPrerequisites(randomUUID(), { prerequisiteIds: [] }), /not found/);
    const db = new DatabaseSync(join(root, 'tracker.db'));
    try {
      db.exec('PRAGMA foreign_keys=ON');
      const insert = db.prepare('INSERT INTO ticket_dependencies VALUES(?,?)');
      assert.throws(() => insert.run(c.id, a.id), /cycle/);
      assert.throws(() => insert.run(c.id, foreign.id), /same project/);
      assert.throws(() => insert.run(c.id, randomUUID()), /FOREIGN KEY/);
      assert.throws(() => insert.run(c.id, c.id));
      assert.throws(() => db.exec("UPDATE ticket_dependencies SET prerequisite_id=ticket_id"), /Replace/);
    } finally { db.close(); }
    assert.deepEqual(store.projects.view(p.id), before);
    for (const dependencies of [[{ ticketId: a.id, prerequisiteId: a.id }], [{ ticketId: a.id, prerequisiteId: foreign.id }],
      [...before.dependencies, { ticketId: c.id, prerequisiteId: a.id }], [before.dependencies[0], before.dependencies[0]], [{}]]) {
      assert.throws(() => parseProjectView({ ...before, dependencies }));
    }
  } finally { store.close(); await rm(root, { recursive: true, force: true }); }
});

test('prerequisite HTTP saves, checked reads and rejected starts agree', async () => {
  const root = await mkdtemp(join(tmpdir(), 'focusflow-deps-http-'));
  const fixture = await openWorkspaceStore(join(root, 'tracker.db'));
  const project = fixture.projects.addProject({ title: 'Dependency test' });
  const milestone = fixture.projects.addMilestone({ projectId: project.id, title: 'Test' });
  const ticket = fixture.projects.addTicket({ milestoneId: milestone.id, title: 'Use input' });
  fixture.projects.setStatus(ticket.id, 'ready'); fixture.close();
  const server = await startWorkspaceServer({ dataDirectory: root });
  const transport: typeof fetch = (path, options) => fetch(server.origin + String(path), {
    ...options, headers: { ...options?.headers, Origin: server.origin },
  });
  try {
    const client = createProjectClient(transport);
    const actions = createActionClient(transport);
    const view = await client.read();
    const chosen = view.tickets[0]!;
    const next = await client.addTicket({ title: 'Input', description: '', acceptanceCriteria: '', milestoneId: chosen.milestoneId });
    const input = next.tickets.find(t => t.id !== chosen.id)!;
    await client.setPrerequisites(chosen.id, [input.id]);
    assert.equal(projectActions(await actions.read()).next, null);
    await assert.rejects(actions.start(chosen.id), /prerequisites/);
    await client.setStatus(input.id, 'done');
    assert.equal(projectActions(await actions.read()).next?.ticket.id, chosen.id);
    assert.equal(projectActions(await actions.start(chosen.id)).active.length, 1);
    await assert.rejects(client.setPrerequisites(input.id, [chosen.id]), /cycle/);
    assert.equal((await fetch(server.origin + '/api/project-tickets/' + chosen.id + '/prerequisites', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"prerequisiteIds":[]}',
    })).status, 403);
  } finally { await server.close(); await rm(root, { recursive: true, force: true }); }
});

test('schema 5 migrates with a restorable unchanged snapshot and backup failure blocks schema 6', async () => {
  const root = await mkdtemp(join(tmpdir(), 'focusflow-deps-migration-'));
  function prior(path: string) {
    const db = new DatabaseSync(path);
    for (const migration of MIGRATIONS.slice(0, 5)) db.exec(migration.sql);
    db.exec("PRAGMA user_version=5; INSERT INTO projects VALUES('p','Plan','','2026-11-06T00:00:00Z');");
    db.close();
  }
  try {
    const path = join(root, 'tracker.db');
    prior(path);
    const before = await readFile(path);
    await writeFile(join(root, 'backups'), 'blocked');
    await assert.rejects(openWorkspaceStore(path), /DATABASE_MIGRATION_FAILED/);
    assert.deepEqual(await readFile(path), before);
    await rm(join(root, 'backups'));
    const store = await openWorkspaceStore(path);
    try { assert.equal(store.projects.view().projects[0]?.title, 'Plan'); }
    finally { store.close(); }
    const { readdir } = await import('node:fs/promises');
    const snapshot = (await readdir(join(root, 'backups'))).find(name => name.endsWith('.db'))!;
    const restored = join(root, 'restored.db');
    await restoreSnapshot(join(root, 'backups', snapshot), restored);
    const old = new DatabaseSync(restored);
    try {
      assert.equal(old.prepare('PRAGMA user_version').get()?.user_version, 5);
      assert.equal(old.prepare('SELECT title FROM projects').get()?.title, 'Plan');
      assert.equal(old.prepare("SELECT name FROM sqlite_schema WHERE name='ticket_dependencies'").get(), undefined);
    } finally { old.close(); }
  } finally { await rm(root, { recursive: true, force: true }); }
});
