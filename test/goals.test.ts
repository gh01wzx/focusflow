import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { openWorkspaceStore } from '../src/workspace/store.ts';
import { quarterOf, quarterRange } from '../src/shared/goals.ts';

test('quarters map days to their calendar quarter and full date range', () => {
  assert.equal(quarterOf('2026-11-22'), '2026-Q4');
  assert.equal(quarterOf('2027-01-01'), '2027-Q1');
  assert.deepEqual(quarterRange('2028-Q1'), { start: '2028-01-01', end: '2028-03-31' });
});

test('goals count linked completions and check-ins, and the quarterly review carries or closes them', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'focusflow-goals-test-'));
  t.after(async () => {
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
    assert.ok(basename(directory).startsWith('focusflow-goals-test-'));
    await rm(directory, { recursive: true, force: true });
  });
  let now = new Date(2026, 10, 22, 9);
  const store = await openWorkspaceStore(join(directory, 'tracker.db'), () => now);
  try {
    const goal = store.goals.add({ title: 'Run a half marathon' }).goals[0]!;
    const run = store.tasks.addRecurrence({ title: 'Run', plannedDate: '2026-11-22', frequency: 'daily', category: 'habit', mode: 'minutes',
      plan: { target: 20, goalId: goal.id } });
    const occurrence = store.tasks.view().due.find(task => task.recurrenceId === run.id)!;
    store.personal.mutate('log', { id: randomUUID(), day: '2026-11-22', subject: occurrence.id, minutes: 2, unit: 'minutes' });
    assert.equal(store.goals.view().goals[0]?.done, 1);
    assert.deepEqual(store.goals.view().goals[0]?.links.map(link => link.title), ['Run']);
    now = new Date(2027, 0, 3, 9);
    assert.equal(store.goals.act(goal.id, 'carry').goals[0]?.quarter, '2027-Q1');
    assert.equal(store.goals.act(goal.id, 'done').goals[0]?.status, 'done');
    assert.throws(() => store.personal.mutate('rule', { subject: run.id, mode: 'minutes', unit: 'minutes', rate: 100, target: 20,
      category: 'habit', goalId: goal.id }));
  } finally { store.close(); }
});
