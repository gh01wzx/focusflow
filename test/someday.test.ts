import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { openWorkspaceStore } from '../src/workspace/store.ts';

test('Someday ideas become one-off tasks only when planned, in one step', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'focusflow-someday-test-'));
  t.after(async () => {
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
    assert.ok(basename(directory).startsWith('focusflow-someday-test-'));
    await rm(directory, { recursive: true, force: true });
  });
  const store = await openWorkspaceStore(join(directory, 'tracker.db'), () => new Date(2026, 10, 22, 9));
  try {
    store.someday.add({ title: '  Learn to bake bread  ' });
    const items = store.someday.add({ title: 'Repaint the hallway' });
    assert.throws(() => store.someday.add({ title: ' ' }));
    const bread = items.find(item => item.title === 'Learn to bake bread')!;
    assert.equal(store.someday.schedule(bread.id, { plannedDate: '2026-11-29' }).length, 1);
    assert.equal(store.tasks.view().upcoming.find(task => task.title === 'Learn to bake bread')?.plannedDate, '2026-11-29');
    const hall = store.someday.list()[0]!;
    assert.throws(() => store.someday.schedule(hall.id, { plannedDate: 'soon' }));
    assert.equal(store.someday.list().length, 1);
    assert.equal(store.someday.remove(hall.id).length, 0);
  } finally { store.close(); }
});
