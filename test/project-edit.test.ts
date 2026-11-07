import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { openWorkspaceStore } from '../src/workspace/store.ts';
import { startWorkspaceServer } from '../src/workspace/server.ts';
import { createProjectClient } from '../src/client/projects.ts';
import { createActionClient } from '../src/client/actions.ts';
import { TICKET_STATUSES } from '../src/shared/projects.ts';
import { ProjectInputError, ProjectNotFoundError } from '../src/projects/validation.ts';

test('editing every level preserves identities, relationships and all ticket statuses across restart', async () => {
  const root = await mkdtemp(join(tmpdir(), 'focusflow-edit-'));
  let now = new Date('2026-11-06T00:00:00Z');
  let store = await openWorkspaceStore(join(root, 'tracker.db'), () => now);
  try {
    const personal = store.tasks.add({ title: 'Everyday work', plannedDate: '2026-11-06' });
    const project = store.projects.addProject({ title: 'Plan' });
    const other = store.projects.addProject({ title: 'Other' });
    const milestone = store.projects.addMilestone({ title: 'Goal', projectId: project.id });
    const foreign = store.projects.addMilestone({ title: 'Foreign', projectId: other.id });
    const text = '\u9879\u76ee <img src=x onerror=alert(1)> \\ "); DROP TABLE projects; --';
    const draft = { title: text, description: 'First line\nSecond line', acceptanceCriteria: 'Check one\nCheck two' };
    const originals = TICKET_STATUSES.map(status => {
      const ticket = store.projects.addTicket({ title: status, milestoneId: milestone.id });
      store.projects.setStatus(ticket.id, status);
      return store.projects.view(project.id).tickets.find(item => item.id === ticket.id)!;
    });
    store.projects.setPrerequisites(originals[0]!.id, { prerequisiteIds: [originals.find(ticket => ticket.status === 'done')!.id] });
    originals[0] = store.projects.view(project.id).tickets.find(ticket => ticket.id === originals[0]!.id)!;
    const links = store.projects.view(project.id).dependencies;
    now = new Date('2026-11-06T01:00:00Z');
    store.projects.editProject(project.id, draft);
    store.projects.editMilestone(milestone.id, { ...draft, projectId: other.id });
    for (const ticket of originals) {
      store.projects.editTicket(ticket.id, { ...draft, id: 'replacement', milestoneId: foreign.id, status: 'backlog' });
      const updated = store.projects.view(project.id).tickets.find(item => item.id === ticket.id)!;
      assert.deepEqual({ ...updated }, { ...ticket, ...draft, updatedAt: now.toISOString() });
    }
    const expected = store.projects.view(project.id);
    assert.deepEqual(expected.dependencies, links);
    assert.deepEqual({ ...expected.projects.find(item => item.id === project.id) }, { ...project, title: text, description: draft.description });
    assert.deepEqual({ ...expected.milestones[0] }, { ...milestone, title: text, description: draft.description });
    now = new Date('2026-11-06T02:00:00Z');
    store.projects.editTicket(originals[0]!.id, draft);
    assert.deepEqual(store.projects.view(project.id), expected, 'Unchanged text must not advance updatedAt.');
    store.close();
    store = await openWorkspaceStore(join(root, 'tracker.db'), () => now);
    assert.deepEqual(store.projects.view(project.id), expected);
    assert.equal(store.projects.view(other.id).milestones[0]?.id, foreign.id);
    assert.equal(store.tasks.view().due[0]?.id, personal.id);
  } finally { store.close(); await rm(root, { recursive: true, force: true }); }
});

test('invalid or missing edit targets leave the complete plan unchanged', async () => {
  const root = await mkdtemp(join(tmpdir(), 'focusflow-edit-invalid-'));
  const store = await openWorkspaceStore(join(root, 'tracker.db'));
  try {
    const project = store.projects.addProject({ title: 'Plan' });
    const milestone = store.projects.addMilestone({ title: 'Goal', projectId: project.id });
    const ticket = store.projects.addTicket({ title: 'Work', milestoneId: milestone.id });
    const before = store.projects.view(project.id);
    const operations = [
      (input: unknown) => store.projects.editProject(project.id, input),
      (input: unknown) => store.projects.editMilestone(milestone.id, input),
      (input: unknown) => store.projects.editTicket(ticket.id, input),
    ];
    for (const update of operations) {
      for (const input of [null, {}, { title: ' ' }, { title: 'x'.repeat(301) },
        { title: 'Valid', description: false }, { title: 'Valid', description: 'x'.repeat(2001) }]) {
        assert.throws(() => update(input), ProjectInputError);
        assert.deepEqual(store.projects.view(project.id), before);
      }
    }
    for (const extra of [{ acceptanceCriteria: 10 }, { acceptanceCriteria: 'x'.repeat(2001) }, { executionMode: 'robot' }]) {
      assert.throws(() => store.projects.editTicket(ticket.id, { title: 'Valid', ...extra }), ProjectInputError);
    }
    for (const edit of [store.projects.editProject, store.projects.editMilestone, store.projects.editTicket]) {
      assert.throws(() => edit(randomUUID(), { title: 'Missing' }), ProjectNotFoundError);
    }
    assert.deepEqual(store.projects.view(project.id), before);
  } finally { store.close(); await rm(root, { recursive: true, force: true }); }
});

test('real edit API preserves selection, exposes updated actions and retains stored text after a failed write', async () => {
  const root = await mkdtemp(join(tmpdir(), 'focusflow-edit-http-'));
  const server = await startWorkspaceServer({ dataDirectory: root });
  const transport: typeof fetch = (path, options) => fetch(server.origin + String(path), {
    ...options, headers: { ...options?.headers, Origin: server.origin },
  });
  const client = createProjectClient(transport);
  try {
    const first = await client.addProject({ title: 'First', description: '' });
    const second = await client.addProject({ title: 'Second', description: '' });
    const id = first.selectedProjectId!;
    const goal = await client.addMilestone(id, { title: 'Goal', description: '' });
    const milestoneId = goal.milestones[0]!.id;
    const added = await client.addTicket({ title: 'Work', description: '', acceptanceCriteria: '', milestoneId });
    const ticketId = added.tickets[0]!.id;
    await client.setStatus(ticketId, 'review');
    assert.equal((await client.editProject(id, { title: 'Corrected project', description: 'Project details' })).selectedProjectId, id);
    assert.equal((await client.editMilestone(milestoneId, { title: 'Corrected milestone', description: '' })).selectedProjectId, id);
    const draft = { title: 'Corrected ticket', description: 'New details', acceptanceCriteria: 'New checks' };
    const expected = await client.editTicket(ticketId, draft);
    assert.equal(expected.tickets[0]?.status, 'review');
    const actions = await createActionClient(transport).read();
    assert.equal(actions.find(view => view.selectedProjectId === id)?.tickets[0]?.title, draft.title);
    const db = new DatabaseSync(join(root, 'tracker.db'));
    try { db.exec("CREATE TRIGGER reject_edit BEFORE UPDATE ON project_tickets BEGIN SELECT RAISE(ABORT,'test write failure'); END;"); }
    finally { db.close(); }
    await assert.rejects(client.editTicket(ticketId, { ...draft, title: 'Unsaved' }), /Could not save local data/);
    assert.deepEqual(await client.read(id), expected);
    const path = '/api/project-tickets/' + ticketId + '/details';
    assert.equal((await fetch(server.origin + path, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(draft),
    })).status, 403);
    assert.equal((await transport(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' })).status, 400);
    await assert.rejects(client.editProject(randomUUID(), { title: 'Missing', description: '' }), /not found/);
    assert.equal((await client.read(second.selectedProjectId!)).tickets.length, 0);
  } finally { await server.close(); await rm(root, { recursive: true, force: true }); }
});
