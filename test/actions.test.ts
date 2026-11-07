import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openWorkspaceStore } from '../src/workspace/store.ts';
import { startWorkspaceServer } from '../src/workspace/server.ts';
import { projectActions } from '../src/shared/actions.ts';
import { createActionClient } from '../src/client/actions.ts';

test('actions span projects, order ties consistently, and start only the selected Backlog ticket across restart', async () => {
  const root = await mkdtemp(join(tmpdir(), 'focusflow-actions-'));
  let store = await openWorkspaceStore(join(root, 'tracker.db'), () => new Date('2026-11-06T00:00:00Z'));
  try {
    assert.deepEqual(projectActions(store.projects.actions()), { review: [], active: [], next: null });
    const ids: string[] = [];
    for (const title of ['One', 'Two']) {
      const project = store.projects.addProject({ title });
      const milestone = store.projects.addMilestone({ projectId: project.id, title: 'Goal' });
      for (const status of ['backlog', 'in_progress', 'review', 'done'] as const) {
        const ticket = store.projects.addTicket({ milestoneId: milestone.id, title: title + status, description: 'Details', acceptanceCriteria: 'Check this' });
        store.projects.setStatus(ticket.id, status);
        if (status === 'backlog') ids.push(ticket.id);
      }
    }
    const actions = projectActions(store.projects.actions());
    assert.equal(actions.review.length, 2); assert.equal(actions.active.length, 2);
    assert.equal(actions.next?.ticket.id, [...ids].sort()[0]);
    const chosen = actions.next!.ticket.id;
    store.projects.start(chosen);
    assert.throws(() => store.projects.start(chosen), /no longer in Backlog/);
    assert.throws(() => store.projects.start(actions.review[0]!.ticket.id), /no longer in Backlog/);
    assert.throws(() => store.projects.start('missing'), /not found/);
    store.close();
    store = await openWorkspaceStore(join(root, 'tracker.db'));
    const reopened = projectActions(store.projects.actions());
    assert.equal(reopened.active.length, 3);
    assert.equal(reopened.next?.ticket.id, ids.find(id => id !== chosen));
  } finally { store.close(); await rm(root, { recursive: true, force: true }); }
});

test('action client uses the real API, preserves failed starts, and rejects malformed lists', async () => {
  const root = await mkdtemp(join(tmpdir(), 'focusflow-actions-http-'));
  const app = await startWorkspaceServer({ dataDirectory: root, sampleLabel: 'Test' });
  try {
    const client = createActionClient((path, options) => fetch(app.origin + String(path), {
      ...options, headers: { ...options?.headers, Origin: app.origin },
    }));
    const before = projectActions(await client.read());
    const next = before.next!;
    assert.equal(projectActions(await client.start(next.ticket.id)).active.length, before.active.length + 1);
    await assert.rejects(client.start(next.ticket.id), /no longer in Backlog/);
    assert.equal(projectActions(await client.read()).active.length, before.active.length + 1);
    for (const data of [{}, [null], [{ projects: [] }]]) {
      const invalid = createActionClient(async () => new Response(JSON.stringify(data)));
      await assert.rejects(invalid.read());
    }
  } finally { await app.close(); await rm(root, { recursive: true, force: true }); }
});
