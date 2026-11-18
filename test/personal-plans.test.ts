import test from 'node:test';
import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { openWorkspaceStore } from '../src/workspace/store.ts';

async function fixture(t: TestContext) {
  const directory = await mkdtemp(join(tmpdir(), 'focusflow-plans-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return join(directory, 'tracker.db');
}
const emptyPlan = { cue: '', identity: '', time: '', place: '', starter: '', bundle: '' };

test('a schedule change with a later effective date keeps the old schedule until then', async t => {
  const path = await fixture(t);
  // November 4, 2026 is a Wednesday.
  let now = new Date(2026, 10, 4, 9);
  const store = await openWorkspaceStore(path, () => now);
  try {
    const created = store.tasks.addRecurrence({ title: 'Stretch', plannedDate: '2026-11-04', frequency: 'daily', category: 'habit' });
    const rule = store.tasks.view().recurrences.find(item => item.id === created.id)!;
    const change = (schedule: Record<string, unknown>) => store.personal.mutate('rule', { subject: rule.id, mode: 'complete',
      category: 'habit', rate: 100, target: 0, ...emptyPlan, schedule });
    const previous = JSON.stringify([rule.frequency, rule.weekdays, rule.nextDate]);
    assert.throws(() => change({ date: '2026-12-31', frequency: 'daily', weekdays: null, previous }), /within four weeks/);
    assert.throws(() => change({ date: '2026-11-09', frequency: 'daily', weekdays: null, previous: '[]' }), /schedule changed/);
    // From Monday, November 9: Mondays and Wednesdays only.
    change({ date: '2026-11-09', frequency: 'weekly', weekdays: [1, 3], previous });
    let view = store.tasks.view();
    const dates = (tasks: { recurrenceId: string | null; plannedDate: string }[]) =>
      tasks.filter(task => task.recurrenceId === rule.id).map(task => task.plannedDate);
    assert.deepEqual(dates(view.due), ['2026-11-04']);
    assert.deepEqual(dates(view.upcoming), ['2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08', '2026-11-09']);
    const updated = view.recurrences.find(item => item.id === rule.id)!;
    assert.deepEqual([updated.frequency, updated.weekdays, updated.nextDate], ['weekly', [1, 3], '2026-11-11']);
    // Thursday, November 12: Wednesday's occurrence was missed and Thursday has none.
    now = new Date(2026, 10, 12, 9);
    view = store.tasks.view();
    assert.deepEqual(dates(view.due), []);
    assert.equal(view.history.find(task => task.recurrenceId === rule.id && task.plannedDate === '2026-11-11')?.status, 'missed');
    // Occurrences made under the old schedule keep their daily period.
    assert.equal(view.history.find(task => task.recurrenceId === rule.id && task.plannedDate === '2026-11-05')?.frequency, 'daily');
  } finally { store.close(); }
});

test('deleting an occurrence or a plan hides it, frees its focus place and keeps earned points', async t => {
  const path = await fixture(t);
  const store = await openWorkspaceStore(path, () => new Date(2026, 10, 4, 9));
  try {
    const task = store.tasks.add({ title: 'Call the bank', plannedDate: '2026-11-04' });
    store.tasks.setFocus({ day: '2026-11-04', taskIds: [task.id] });
    store.personal.mutate('remove', { subject: task.id, scope: 'occurrence' });
    let view = store.tasks.view();
    assert.equal(view.due.some(item => item.id === task.id), false);
    assert.deepEqual(view.focus.today, []);

    const walk = store.tasks.addRecurrence({ title: 'Walk', plannedDate: '2026-11-04', frequency: 'daily', category: 'habit' });
    const read = store.tasks.addRecurrence({ title: 'Read', plannedDate: '2026-11-04', frequency: 'daily', category: 'habit' });
    const walkToday = store.tasks.view().due.find(item => item.recurrenceId === walk.id)!;
    store.tasks.resolve(walkToday.id, 'completed');
    const balance = store.personal.view().balance;
    assert.ok(balance > 0);
    store.personal.mutate('remove', { subject: walk.id, scope: 'plan' });
    store.personal.mutate('remove', { subject: read.id, scope: 'plan' });
    view = store.tasks.view();
    assert.equal(view.recurrences.some(rule => rule.id === walk.id || rule.id === read.id), false);
    assert.equal(view.due.some(item => item.recurrenceId === read.id), false);
    assert.equal(view.history.find(item => item.id === walkToday.id)?.status, 'completed');
    assert.equal(store.personal.view().balance, balance);
    assert.throws(() => store.personal.mutate('remove', { subject: walk.id, scope: 'everything' }), /what to delete/);
  } finally { store.close(); }
});

test('counted activity keeps its recording unit', async t => {
  const path = await fixture(t);
  const store = await openWorkspaceStore(path, () => new Date(2026, 10, 4, 9));
  try {
    const rule = store.tasks.addRecurrence({ title: 'Push-ups', plannedDate: '2026-11-04', frequency: 'daily', category: 'habit',
      mode: 'minutes', unit: 'count', plan: { ...emptyPlan, rate: 10, target: 3 } });
    const occurrence = store.tasks.view().due.find(item => item.recurrenceId === rule.id)!;
    const log = (unit: string, amount: number) => store.personal.mutate('log', { id: randomUUID(), day: '2026-11-04',
      subject: occurrence.id, minutes: amount, unit });
    assert.throws(() => log('minutes', 2), /recording unit changed/);
    log('count', 2);
    assert.equal(store.personal.view().progress[occurrence.id], 2);
    // With activity recorded today, switching to minutes waits for the next occurrence.
    assert.throws(() => store.personal.mutate('rule', { subject: rule.id, mode: 'minutes', unit: 'minutes', category: 'habit',
      rate: 10, target: 3, ...emptyPlan }), /next scheduled occurrence/);
  } finally { store.close(); }
});

test('only a reward in the shop can be pinned', async t => {
  const path = await fixture(t);
  const store = await openWorkspaceStore(path, () => new Date(2026, 10, 4, 9));
  try {
    const id = randomUUID();
    store.personal.mutate('reward', { id, title: 'Tea', cost: 100, note: '', onceOnly: false });
    store.personal.mutate('pin', { pinnedReward: id });
    assert.equal(store.personal.view().preferences.pinnedReward, id);
    assert.throws(() => store.personal.mutate('pin', { pinnedReward: randomUUID() }), /unavailable/);
    store.personal.mutate('reward', { id, title: 'Tea', cost: 100, note: '', onceOnly: false, archived: true });
    assert.throws(() => store.personal.mutate('pin', { pinnedReward: id }), /unavailable/);
    store.personal.mutate('pin', { pinnedReward: '' });
    assert.equal(store.personal.view().preferences.pinnedReward, '');
  } finally { store.close(); }
});
