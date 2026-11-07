import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openWorkspaceStore } from '../src/workspace/store.ts';
import { MIGRATIONS } from '../src/database/schema.ts';
import { projectActions } from '../src/shared/actions.ts';
import { ticketLabel } from '../src/shared/projects.ts';
import { parseProjectView } from '../src/shared/project-codec.ts';
import { ProjectInputError } from '../src/projects/validation.ts';
import { restoreSnapshot } from '../src/database/backup.ts';
import { isGitHubIssueUrl } from '../src/shared/github.ts';

test('desktop Issue links allow only exact GitHub issue URLs', () => {
  assert.equal(isGitHubIssueUrl('https://github.com/fixture/code/issues/123'), true);
  for (const url of ['http://github.com/fixture/code/issues/1', 'https://github.com.evil.invalid/a/b/issues/1',
    'https://github.com@evil.invalid/a/b/issues/1', 'file:///a/b/issues/1', 'https://github.com/a/../issues/1',
    'https://github.com/a/b/issues/1?redirect=elsewhere', 'https://github.com/a/b/issues/0']) {
    assert.equal(isGitHubIssueUrl(url), false);
  }
});

test('coding intent is private, cannot start or fake progress, and survives mode edits and restart', async t => {
  const root = await mkdtemp(join(tmpdir(), 'focusflow-intent-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const path = join(root, 'tracker.db');
  let store = await openWorkspaceStore(path);
  try {
    const project = store.projects.addProject({ title: 'Code' });
    const milestone = store.projects.addMilestone({ title: 'Goal', projectId: project.id });
    const coding = store.projects.addTicket({ title: 'Change', milestoneId: milestone.id, executionMode: 'codex' });
    assert.deepEqual(coding.coding, { repository: null, issueNumber: null });
    assert.throws(() => store.projects.start(coding.id), /verified coding runner/);
    for (const status of ['in_progress', 'review', 'done']) assert.throws(() => store.projects.setStatus(coding.id, status), /observed pull request merge/);
    assert.equal(projectActions(store.projects.actions()).next, null);
    store.projects.editTicket(coding.id, { title: 'Manual change', executionMode: 'manual' });
    assert.equal(projectActions(store.projects.actions()).next?.ticket.id, coding.id);
    store.projects.start(coding.id);
    const before = store.projects.view(project.id);
    assert.throws(() => store.projects.editTicket(coding.id, { title: 'No change', executionMode: 'codex' }), /unpublished Backlog/);
    assert.deepEqual(store.projects.view(project.id), before);
    store.projects.setStatus(coding.id, 'backlog');
    store.projects.editTicket(coding.id, { title: 'Code again', executionMode: 'codex' });
    store.projects.editTicket(coding.id, { title: 'Keep coding intent' });
    const expected = store.projects.view(project.id);
    assert.deepEqual(parseProjectView(expected), expected);
    store.close(); store = await openWorkspaceStore(path);
    assert.deepEqual(store.projects.view(project.id), expected);
    store.close();
    const db = new DatabaseSync(path);
    // Simulate a future publication record without GitHub requests or credentials.
    db.prepare('UPDATE coding_tickets SET repository_json=?,issue_number=123 WHERE ticket_id=?')
      .run(JSON.stringify({ id: 1, fullName: 'fixture/code', private: false }), coding.id);
    db.close(); store = await openWorkspaceStore(path);
    const linked = store.projects.view(project.id).tickets[0]!;
    assert.equal(ticketLabel(linked), '#123 Keep coding intent');
    assert.throws(() => store.projects.editTicket(coding.id, { title: linked.title, executionMode: 'manual' }), ProjectInputError);
    assert.throws(() => store.projects.assertRepositoryChange(project.id, 2), /published coding work/);
    store.projects.assertRepositoryChange(project.id, 1);
    assert.throws(() => store.projects.setStatus(coding.id, 'done'), /observed pull request merge/);
  } finally { store.close(); }
});

test('format 8 upgrades retain tasks and dependencies with a restorable snapshot', async t => {
  const root = await mkdtemp(join(tmpdir(), 'focusflow-intent-migration-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const path = join(root, 'tracker.db');
  const old = new DatabaseSync(path);
  for (const migration of MIGRATIONS.slice(0, 8)) old.exec(migration.sql);
  old.exec(`PRAGMA user_version=8;
    INSERT INTO projects VALUES('p','Plan','','2026-11-07T00:00:00Z');
    INSERT INTO milestones VALUES('m','p','Goal','','2026-11-07T00:00:00Z');
    INSERT INTO project_tickets VALUES('a','m','First','','','done','manual','2026-11-07T00:00:00Z','2026-11-07T00:00:00Z','');
    INSERT INTO project_tickets VALUES('b','m','Second','','','backlog','manual','2026-11-07T00:00:00Z','2026-11-07T00:00:00Z','Waiting');
    INSERT INTO ticket_dependencies VALUES('b','a');`);
  old.close();
  const store = await openWorkspaceStore(path);
  try {
    assert.deepEqual(store.projects.view('p').tickets.map(t => [t.id,t.executionMode,t.blockReason]), [['a','manual',''], ['b','manual','Waiting']]);
    assert.deepEqual(store.projects.view('p').dependencies, [{ ticketId: 'b', prerequisiteId: 'a' }]);
    const snapshot = (await readdir(join(root, 'backups'))).find(name => name.endsWith('.db'))!;
    await restoreSnapshot(join(root, 'backups', snapshot), join(root, 'recovered.db'));
    const restored = new DatabaseSync(join(root, 'recovered.db'), { readOnly: true });
    try { assert.equal(restored.prepare('PRAGMA user_version').get()?.user_version, 8); }
    finally { restored.close(); }
  } finally { store.close(); }
});
