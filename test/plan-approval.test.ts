import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, readdir, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openWorkspaceStore } from '../src/workspace/store.ts';
import { startWorkspaceServer } from '../src/workspace/server.ts';
import { createPlanClient } from '../src/client/plans.ts';
import { MIGRATIONS } from '../src/database/schema.ts';
import { restoreSnapshot, schemaVersion } from '../src/database/backup.ts';
import { parsePlanState } from '../src/shared/plans.ts';
import type { PlanDraft } from '../src/shared/plans.ts';

function draft(projectId: string): PlanDraft {
  return { id: randomUUID(), projectId, goal: 'A private goal', createdAt: '2026-11-08T00:00:00Z', plan: { milestones: [
    { key: 'prepare', title: 'Preparation', description: 'Private notes', tickets: [
      { key: 'input', title: 'Collect input', description: '', acceptanceCriteria: 'Three examples.', executionMode: 'manual', prerequisiteKeys: [] },
      { key: 'optional', title: 'Unwanted suggestion', description: '', acceptanceCriteria: 'Optional.', executionMode: 'manual', prerequisiteKeys: [] },
    ] },
    { key: 'implement', title: 'Implementation', description: '', tickets: [
      { key: 'code', title: 'Build <script>example</script>', description: 'Edited locally', acceptanceCriteria: 'It works.', executionMode: 'codex', prerequisiteKeys: ['input'] },
    ] },
  ] } };
}
const identity = (draft: PlanDraft) => ({ draftId: draft.id, revision: draft.revision ?? draft.id });
const edit = (draft: PlanDraft, selectedTicketKeys = ['input', 'code']) => ({ ...identity(draft), plan: draft.plan, selectedTicketKeys });

test('draft edits persist selection, reject stale writes and never create formal tasks', async t => {
  const root = await mkdtemp(join(tmpdir(), 'focusflow-plan-edit-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const path = join(root, 'tracker.db'); let store = await openWorkspaceStore(path);
  try {
    const project = store.projects.addProject({ title: 'Plan' }); const saved = draft(project.id);
    store.planDrafts.save(saved); const before = store.projects.view(project.id);
    saved.plan.milestones[0]!.title = '\u51c6\u5907';
    store.planApproval.edit(project.id, edit(saved));
    const updated = store.planDrafts.read(project.id)!;
    assert.deepEqual(updated.selectedTicketKeys, ['input', 'code']); assert.notEqual(updated.revision, saved.id);
    assert.throws(() => store.planApproval.edit(project.id, edit(saved)), /changed/);
    assert.throws(() => store.planApproval.approve(project.id, { ...identity(saved), confirm: true }), /changed/);
    const invalid = structuredClone(updated); invalid.plan.milestones[0]!.tickets[0]!.prerequisiteKeys = ['code'];
    assert.throws(() => store.planApproval.edit(project.id, edit(invalid)), /prerequisite/);
    assert.throws(() => store.planApproval.edit(project.id, { ...identity(updated), plan: updated.plan }), /Choose/);
    assert.deepEqual(store.projects.view(project.id), before);
    store.close(); store = await openWorkspaceStore(path);
    assert.deepEqual(store.planDrafts.read(project.id), updated);
    assert.deepEqual(store.projects.view(project.id), before);
  } finally { store.close(); }
});

test('approval requires confirmation and selected prerequisites, then saves once with immutable receipt', async t => {
  const root = await mkdtemp(join(tmpdir(), 'focusflow-plan-approve-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const path = join(root, 'tracker.db'); let store = await openWorkspaceStore(path);
  try {
    const project = store.projects.addProject({ title: 'Plan' }); const saved = draft(project.id); store.planDrafts.save(saved);
    store.planApproval.edit(project.id, edit(saved, ['code']));
    let current = store.planDrafts.read(project.id)!;
    assert.throws(() => store.planApproval.approve(project.id, { ...identity(current), confirm: false }), /Confirm/);
    assert.throws(() => store.planApproval.approve(project.id, { ...identity(current), confirm: true }), /Include the prerequisite/);
    assert.equal(store.projects.view(project.id).tickets.length, 0);
    store.planApproval.edit(project.id, edit(current)); current = store.planDrafts.read(project.id)!;
    const request = { ...identity(current), confirm: true };
    store.planApproval.approve(project.id, request); store.planApproval.approve(project.id, request);
    const view = store.projects.view(project.id); const receipt = store.planApproval.receipt(current.id)!;
    assert.equal(view.tickets.length, 2); assert.equal(view.milestones.length, 2);
    assert.equal(view.tickets.some(ticket => ticket.title === 'Unwanted suggestion'), false);
    assert.ok(view.tickets.every(ticket => ticket.status === 'backlog'));
    const coding = view.tickets.find(ticket => ticket.executionMode === 'codex')!;
    const manual = view.tickets.find(ticket => ticket.executionMode === 'manual')!;
    assert.deepEqual(coding.coding, { repository: null, issueNumber: null });
    assert.deepEqual(view.dependencies, [{ ticketId: coding.id, prerequisiteId: manual.id }]);
    assert.deepEqual(receipt.codingTicketIds, [coding.id]);
    assert.throws(() => store.projects.start(coding.id), /verified coding runner/);
    assert.throws(() => store.planApproval.edit(project.id, edit(current)), /already approved/);
    const snapshot = await store.snapshot();
    store.close(); store = await openWorkspaceStore(path);
    store.planApproval.approve(project.id, request);
    assert.deepEqual(store.projects.view(project.id), view); assert.deepEqual(store.planApproval.receipt(current.id), receipt);
    await restoreSnapshot(snapshot.path, join(root, 'recovered.db'));
    const recovered = await openWorkspaceStore(join(root, 'recovered.db'));
    try { assert.deepEqual(recovered.planApproval.receipt(current.id), receipt); assert.deepEqual(recovered.projects.view(project.id), view); }
    finally { recovered.close(); }
    store.planDrafts.save({ ...current, id: randomUUID() });
    assert.throws(() => store.planApproval.approve(project.id, request), /changed/);
    assert.deepEqual(store.projects.view(project.id), view);
  } finally { store.close(); }
});

test('a mid-approval disk failure rolls back milestones, tickets, links and receipt together', async t => {
  const root = await mkdtemp(join(tmpdir(), 'focusflow-plan-rollback-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const path = join(root, 'tracker.db'); const store = await openWorkspaceStore(path);
  try {
    const project = store.projects.addProject({ title: 'Plan' }); const saved = draft(project.id); store.planDrafts.save(saved);
    const before = store.projects.view(project.id); const db = new DatabaseSync(path);
    try { db.exec("CREATE TRIGGER fail_plan BEFORE INSERT ON plan_approvals BEGIN SELECT RAISE(ABORT,'simulated write failure'); END;"); }
    finally { db.close(); }
    assert.throws(() => store.planApproval.approve(project.id, { ...identity(saved), confirm: true }), /simulated write failure/);
    assert.deepEqual(store.projects.view(project.id), before); assert.equal(store.planApproval.receipt(saved.id), null);
    assert.deepEqual(store.planDrafts.read(project.id), saved);
    const repair = new DatabaseSync(path); repair.exec('DROP TRIGGER fail_plan'); repair.close();
    store.planApproval.approve(project.id, { ...identity(saved), confirm: true });
    assert.equal(store.projects.view(project.id).tickets.length, 3);
  } finally { store.close(); }
});

test('HTTP approval survives a lost reply, rejects cross-project identities and retains server guards', async t => {
  const root = await mkdtemp(join(tmpdir(), 'focusflow-plan-http-'));
  const store = await openWorkspaceStore(join(root, 'tracker.db'));
  const project = store.projects.addProject({ title: 'Plan' }); const saved = draft(project.id); store.planDrafts.save(saved); store.close();
  const server = await startWorkspaceServer({ dataDirectory: root });
  t.after(async () => { await server.close(); await rm(root, { recursive: true, force: true }); });
  const transport: typeof fetch = (path, options) => fetch(server.origin + String(path), { ...options, headers: { ...options?.headers, Origin: server.origin } });
  const client = createPlanClient(transport);
  const edited = await client.edit({ ...saved, selectedTicketKeys: ['input', 'code'] });
  await assert.rejects(client.approve(edited.draft!, false), /Confirm/);
  assert.equal((await fetch(server.origin + `/api/projects/${project.id}/plan-draft/approve`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...identity(edited.draft!), confirm: true }),
  })).status, 403);
  const unreliable = createPlanClient(async (path, options) => {
    const response = await transport(path, options); assert.equal(response.status, 200); throw new Error('Lost reply after commit');
  });
  await assert.rejects(unreliable.approve(edited.draft!, true), /Lost reply/);
  const replies = await Promise.all([client.approve(edited.draft!, true), client.approve(edited.draft!, true), client.read(project.id)]);
  assert.ok(replies.every(reply => JSON.stringify(reply.approval) === JSON.stringify(replies[0]!.approval)));
  assert.equal(replies[0]!.approval!.ticketIds.length, 2);
  assert.throws(() => parsePlanState({ ...replies[0], approval: { ...replies[0]!.approval, projectId: randomUUID() } }));
  await assert.rejects(client.edit(edited.draft!), /already approved/);
});

test('format 9 gains approval storage only after a verified snapshot and preserves the original draft', async t => {
  const root = await mkdtemp(join(tmpdir(), 'focusflow-plan-upgrade-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  function prior(path: string) {
    const db = new DatabaseSync(path); for (const migration of MIGRATIONS.filter(item => item.version <= 9)) db.exec(migration.sql);
    const projectId = randomUUID(); const saved = draft(projectId);
    db.prepare('INSERT INTO projects VALUES(?,?,?,?)').run(projectId, 'Plan', '', saved.createdAt);
    db.prepare('INSERT INTO plan_drafts VALUES(?,?)').run(projectId, JSON.stringify(saved));
    db.exec('PRAGMA user_version=9'); db.close(); return saved;
  }
  const path = join(root, 'tracker.db'); const saved = prior(path);
  const store = await openWorkspaceStore(path);
  try { assert.deepEqual(store.planDrafts.read(saved.projectId), saved); assert.equal(store.planApproval.receipt(saved.id), null); }
  finally { store.close(); }
  const backup = (await readdir(join(root, 'backups'))).find(name => name.endsWith('.db'))!;
  await restoreSnapshot(join(root, 'backups', backup), join(root, 'restored.db'));
  const restored = new DatabaseSync(join(root, 'restored.db'));
  try { assert.equal(schemaVersion(restored), 9); assert.equal(restored.prepare("SELECT name FROM sqlite_schema WHERE name='plan_approvals'").get(), undefined); }
  finally { restored.close(); }
  const blocked = join(root, 'blocked'); await mkdir(blocked); const blockedPath = join(blocked, 'tracker.db'); prior(blockedPath);
  await writeFile(join(blocked, 'backups'), 'blocked'); await assert.rejects(openWorkspaceStore(blockedPath));
  const unchanged = new DatabaseSync(blockedPath); try { assert.equal(schemaVersion(unchanged), 9); } finally { unchanged.close(); }
});
