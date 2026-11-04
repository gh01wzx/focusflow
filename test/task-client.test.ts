import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { createTaskClient } from '../src/client/tasks.ts';
import { startTaskServer } from '../src/tasks/server.ts';
import type { TaskView } from '../src/shared/tasks.ts';

const emptyView: TaskView = { today: '2026-11-04', due: [], upcoming: [], history: [], recurrences: [] };

test('browser client uses the real task API for one-time and repeating task lifecycles', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'focusflow-task-client-'));
  let now = new Date(2026, 10, 4);
  const server = await startTaskServer({ dataDirectory: directory, clock: () => now });
  t.after(async () => {
    await server.close();
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
    assert.ok(basename(directory).startsWith('focusflow-task-client-'));
    await rm(directory, { recursive: true, force: true });
  });
  const transport: typeof fetch = (path, options) => fetch(server.origin + String(path), {
    ...options, headers: { ...options?.headers, Origin: server.origin },
  });
  const client = createTaskClient(transport);
  assert.deepEqual(await client.read(), emptyView);
  const added = await client.add({ title: 'One time', plannedDate: '2026-11-03', frequency: 'none' });
  const oneTime = added.due[0]!;
  const completed = await client.resolve(oneTime.id, 'completed');
  assert.equal(completed.history[0]?.status, 'completed');
  const repeating = await client.add({ title: 'Daily', plannedDate: '2026-11-04', frequency: 'daily' });
  const rule = repeating.recurrences[0]!;
  now = new Date(2026, 10, 5);
  const next = await client.read();
  assert.equal(next.due[0]?.plannedDate, '2026-11-05');
  assert.equal(next.history.find(task => task.recurrenceId === rule.id)?.status, 'missed');
  await client.stopRecurrence(rule.id);
  now = new Date(2026, 10, 6);
  assert.equal((await client.read()).due.length, 0);
  await assert.rejects(client.add({ title: ' ', plannedDate: '2026-11-06', frequency: 'none' }), /Enter a task title/);
});

test('client rejects malformed nested tasks and schedules before they reach the renderer', async () => {
  const task = { id: 'example', title: 'Read', plannedDate: '2026-11-04', status: 'pending',
    createdAt: '2026-11-04T00:00:00Z', resolvedAt: null, recurrenceId: null, frequency: null };
  const rule = { id: 'rule', title: 'Repeat', frequency: 'weekly', startDate: '2026-11-04',
    nextDate: '2026-11-11', createdAt: '2026-11-04T00:00:00Z', stoppedAt: null };
  for (const payload of [null, [], { ...emptyView, today: '2026-02-30' },
    { ...emptyView, due: [{ ...task, title: {} }] },
    { ...emptyView, due: [{ ...task, status: 'completed', resolvedAt: null }] },
    { ...emptyView, due: [{ ...task, plannedDate: '2026-02-29' }] },
    { ...emptyView, recurrences: [{ ...rule, frequency: 'monthly' }] },
    { ...emptyView, recurrences: [{ ...rule, nextDate: 42 }] },
  ]) {
    const client = createTaskClient(async () => new Response(JSON.stringify(payload)));
    await assert.rejects(client.read(), /Could not read local tasks/);
  }
});

test('client distinguishes readable API failures from malformed responses', async () => {
  const invalidJson = createTaskClient(async () => new Response('<html>failure</html>', { status: 500 }));
  await assert.rejects(invalidJson.read(), /Could not read local tasks/);
  const invalidError = createTaskClient(async () => new Response('{"error":{"internal":"details"}}', { status: 500 }));
  await assert.rejects(invalidError.read(), /^Error: Could not save\. Please try again\.$/);
  const knownError = createTaskClient(async () => new Response('{"error":"Choose a valid planned date."}', { status: 400 }));
  await assert.rejects(knownError.read(), /Choose a valid planned date/);
});

test('client accepts both read views and mutation envelopes without mutating the response', async () => {
  for (const payload of [emptyView, { task: {}, view: emptyView }]) {
    const client = createTaskClient(async () => new Response(JSON.stringify(payload)));
    assert.deepEqual(await client.read(), emptyView);
  }
});
