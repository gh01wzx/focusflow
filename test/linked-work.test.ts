import test from 'node:test';
import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openWorkspaceStore } from '../src/workspace/store.ts';
import { createLinkedWorkService } from '../src/sync/service.ts';
import { issueBody } from '../src/shared/publication.ts';
import type { LinkedIssue, LinkedPull } from '../src/shared/linked-work.ts';
import { issueFields, parseLinkedWorkState } from '../src/shared/linked-work.ts';
import { createGitHubService } from '../src/github/service.ts';
import type { GitHubVault } from '../src/github/vault.ts';
import { isGitHubPullUrl } from '../src/shared/github.ts';
import { createLinkedWorkClient } from '../src/client/linked-work.ts';
import { startWorkspaceServer } from '../src/workspace/server.ts';
import { MIGRATIONS } from '../src/database/schema.ts';
import { restoreSnapshot, schemaVersion } from '../src/database/backup.ts';

const repo = { id: 7, fullName: 'sample/work', private: false }, at = '2026-11-08T00:00:00Z';
async function fixture(t: TestContext) {
  const root = await mkdtemp(join(tmpdir(), 'focusflow-sync-')), path = join(root, 'tracker.db');
  let store = await openWorkspaceStore(path), cleanup = async () => {};
  t.after(async () => { await cleanup(); try { store.close(); } catch {} await rm(root, { recursive: true, force: true }); });
  const project = store.projects.addProject({ title: 'Plan' }); const milestone = store.projects.addMilestone({ projectId: project.id, title: 'Goal' });
  const ticket = store.projects.addTicket({ milestoneId: milestone.id, title: 'Original', description: 'Original description', acceptanceCriteria: 'Original steps', executionMode: 'codex' });
  const content = { ticketId: ticket.id, title: ticket.title, description: ticket.description, acceptanceCriteria: ticket.acceptanceCriteria, prerequisites: [], privatePrerequisites: 0 };
  const batch = { id: randomUUID(), projectId: project.id, repository: repo, approvedAt: null,
    items: [{ content, stage: 'pending' as const, issueNumber: null, message: '' }] };
  store.projectTransaction(() => {
    store.publications.insert(batch); store.publications.approve(batch.id, at); store.publications.link(batch.items[0]!, batch, 10);
    store.publications.setItem(ticket.id, 'published', 10);
  });
  let remote: LinkedIssue = { number: 10, title: '[10] Original', body: issueBody(content), state: 'open', updatedAt: at };
  let pull: LinkedPull = { number: 11, title: '[10] Change', body: 'Closes #10', state: 'open', updatedAt: at, headSha: 'a'.repeat(40), merged: false, mergeCommitSha: null };
  let offline = false;
  const provider = { read: async () => { if (offline) throw new Error('private-token'); return structuredClone(remote); }, pull: async () => structuredClone(pull) };
  let service = createLinkedWorkService(store.linkedWork, store.projectRepository, store.projectTransaction, provider);
  return { root, path, project, ticket, content, provider, get store() { return store; }, get service() { return service; },
    setRemote: (value: Partial<LinkedIssue>) => { remote = { ...remote, ...value }; }, getRemote: () => remote,
    setPull: (value: Partial<LinkedPull>) => { pull = { ...pull, ...value }; }, offline: (value: boolean) => { offline = value; },
    onCleanup: (value: () => Promise<void>) => { cleanup = value; },
    async reopen() { store.close(); store = await openWorkspaceStore(path); service = createLinkedWorkService(store.linkedWork, store.projectRepository, store.projectTransaction, provider); },
  };
}
const decision = (state: ReturnType<ReturnType<typeof createLinkedWorkService>['state']>) => ({ token: state.token, confirm: true });

test('linked fields show local/remote changes, require explicit fresh decisions and preserve canonical identity/status', async t => {
  const f = await fixture(t); let state = await f.service.refresh(f.ticket.id);
  assert.equal(state.matches, true); assert.equal(state.localChanged, false); assert.equal(state.remoteChanged, false);
  assert.deepEqual(parseLinkedWorkState(state), state);
  const input = { ...decision(state), fields: { ...state.local, title: 'Local proposal' } };
  assert.throws(() => f.service.edit(f.ticket.id, { ...input, confirm: false }), /confirm/);
  state = f.service.edit(f.ticket.id, input); assert.equal(state.localChanged, true); assert.equal(state.remoteChanged, false);
  assert.equal(f.getRemote().title, '[10] Original'); assert.throws(() => f.service.edit(f.ticket.id, input), /Refresh/);
  state = await f.service.acceptRemote(f.ticket.id, decision(state)); assert.equal(state.matches, true); assert.equal(state.local.title, 'Original');
  f.setRemote({ title: '[10] GitHub title', state: 'closed', body: issueBody({ ...f.content, description: 'GitHub description', acceptanceCriteria: 'Changed steps' }) });
  state = await f.service.refresh(f.ticket.id); assert.equal(state.remoteChanged, true); assert.equal(state.localChanged, false); assert.equal(state.local.title, 'Original');
  state = await f.service.acceptRemote(f.ticket.id, decision(state)); assert.equal(state.matches, true); assert.equal(state.local.title, 'GitHub title');
  const saved = f.store.projects.view(f.project.id).tickets[0]!;
  assert.equal(saved.status, 'backlog'); assert.equal(saved.coding!.issueNumber, 10); assert.deepEqual(saved.coding!.repository, repo);
  await f.reopen(); assert.deepEqual(f.service.state(f.ticket.id), state);
});

test('changed remote snapshots, unknown formats and ambiguous headings never replace local text', async t => {
  const f = await fixture(t); let state = await f.service.refresh(f.ticket.id);
  f.setRemote({ title: '[10] Changed after preview' });
  await assert.rejects(f.service.acceptRemote(f.ticket.id, decision(state)), /changed after/);
  assert.equal(f.store.projects.view(f.project.id).tickets[0]!.title, 'Original');
  for (const body of ['Unrecognized body', issueBody({ ...f.content, description: '## How to check\n\nAn ambiguous heading' }), issueBody({ ...f.content, ticketId: randomUUID() })]) {
    f.setRemote({ body }); state = await f.service.refresh(f.ticket.id); assert.equal(state.remoteFields, null);
    await assert.rejects(f.service.acceptRemote(f.ticket.id, decision(state)), /recognized/);
    assert.equal(f.service.state(f.ticket.id).local.title, 'Original');
  }
});

test('out-of-order refreshes and pre-edit reads cannot replace newer evidence', async t => {
  const f = await fixture(t); const replies: ((value: LinkedIssue) => void)[] = [];
  const service = createLinkedWorkService(f.store.linkedWork, f.store.projectRepository, f.store.projectTransaction,
    { ...f.provider, read: () => new Promise<LinkedIssue>(resolve => { replies.push(resolve); }) });
  const first = service.refresh(f.ticket.id), second = service.refresh(f.ticket.id);
  replies[1]!({ ...f.getRemote(), title: '[10] Newest', updatedAt: '2026-11-08T01:00:00Z' }); await second;
  replies[0]!({ ...f.getRemote(), title: '[10] Oldest' }); await first;
  assert.equal(service.state(f.ticket.id).remote!.title, '[10] Newest');
  const pending = service.refresh(f.ticket.id), current = service.state(f.ticket.id);
  service.edit(f.ticket.id, { ...decision(current), fields: { ...current.local, title: 'Edited while reading' } });
  replies[2]!({ ...f.getRemote(), title: '[10] Stale before edit' }); await pending;
  assert.equal(service.state(f.ticket.id).remote!.title, '[10] Newest'); assert.equal(service.state(f.ticket.id).local.title, 'Edited while reading');
});

test('offline refresh retains successful evidence and timestamps without provider secrets; snapshots retain links', async t => {
  const f = await fixture(t); const before = await f.service.refresh(f.ticket.id); f.offline(true);
  const failed = await f.service.refresh(f.ticket.id);
  assert.equal(failed.lastSuccess, before.lastSuccess); assert.deepEqual(failed.remote, before.remote); assert.match(failed.error, /sign-in/);
  assert.doesNotMatch(JSON.stringify(failed), /private-token/);
  const snapshot = await f.store.snapshot(); await restoreSnapshot(snapshot.path, join(f.root, 'recovered.db'));
  const restored = await openWorkspaceStore(join(f.root, 'recovered.db'));
  try { assert.deepEqual(restored.linkedWork.read(f.ticket.id), f.store.linkedWork.read(f.ticket.id)); } finally { restored.close(); }
});

test('explicit PR linking retains identity and changed heads, but closed Issues/PRs and observed merge never auto-complete', async t => {
  const f = await fixture(t); let state = await f.service.refresh(f.ticket.id);
  f.setPull({ body: 'Closes #999' }); await assert.rejects(f.service.linkPull(f.ticket.id, { ...decision(state), number: 11 }), /must explicitly close/);
  f.setPull({ body: 'Closes #10', state: 'closed' }); state = await f.service.linkPull(f.ticket.id, { ...decision(state), number: 11 });
  assert.equal(state.pull!.merged, false); assert.equal(state.pullNumber, 11);
  await assert.rejects(f.service.linkPull(f.ticket.id, { ...decision(state), number: 12 }), /already has/);
  f.setPull({ headSha: 'b'.repeat(40), merged: true, mergeCommitSha: 'c'.repeat(40) }); f.setRemote({ state: 'closed' });
  const changed = await f.service.refresh(f.ticket.id); assert.notEqual(changed.token, state.token); assert.equal(changed.pull!.headSha, 'b'.repeat(40));
  assert.equal(f.store.projects.view(f.project.id).tickets[0]!.status, 'backlog');
  await f.reopen(); assert.equal(f.service.state(f.ticket.id).pullNumber, 11); assert.equal(f.service.state(f.ticket.id).pull!.mergeCommitSha, 'c'.repeat(40));
});

test('real local sync HTTP guards Origin and manual work; provider reads sanitize Issue/PR metadata', async t => {
  const f = await fixture(t); f.store.close();
  const vault: GitHubVault = { available: async () => true, read: async () => ({ clientId: 'Iv.fixture', token: 'ghu_fixture_token', account: 'sample', expiresAt: null,
    repositories: { [f.project.id]: repo } }), write: async () => {}, clear: async () => {} };
  const github = createGitHubService(vault, async (url, input) => {
    assert.equal(input?.method, 'GET');
    if (String(url).endsWith('/repos/sample/work')) return Response.json({ id: 7, full_name: 'sample/work', private: false });
    if (String(url).includes('/pulls/')) return Response.json({ ...f.getRemote(), number: 11, body: 'Closes #10', updated_at: at, head: { sha: 'a'.repeat(40) }, merged: false, merge_commit_sha: null, secret: 'private-token' });
    return Response.json({ ...f.getRemote(), updated_at: at, secret: 'private-token' });
  });
  const server = await startWorkspaceServer({ dataDirectory: f.root, github }); f.onCleanup(() => server.close());
  const client = createLinkedWorkClient((path, input) => fetch(server.origin + String(path), { ...input, headers: { ...input?.headers, Origin: server.origin } }));
  const state = await client.act(f.ticket.id, 'refresh'); assert.equal(state.matches, true); assert.doesNotMatch(JSON.stringify(state), /private-token/);
  const linked = await client.act(f.ticket.id, 'link-pr', { ...decision(state), number: 11 }); assert.equal(linked.pullNumber, 11);
  assert.equal((await fetch(server.origin + `/api/project-tickets/${f.ticket.id}/linked-work/refresh`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 403);
  await assert.rejects(client.read(randomUUID()), /published coding ticket/);
  assert.equal(isGitHubPullUrl('https://github.com/sample/work/pull/11'), true);
  for (const url of ['http://github.com/sample/work/pull/11', 'https://github.com/sample/../pull/11', 'https://github.com.evil.invalid/sample/work/pull/11', 'https://github.com/sample/work/pull/11?next=elsewhere']) assert.equal(isGitHubPullUrl(url), false);
});

test('format 11 upgrades retain publication results and restore its unchanged prior snapshot', async t => {
  const root = await mkdtemp(join(tmpdir(), 'focusflow-sync-upgrade-')); t.after(() => rm(root, { recursive: true, force: true }));
  const path = join(root, 'tracker.db'), db = new DatabaseSync(path);
  for (const migration of MIGRATIONS.filter(m => m.version <= 11)) db.exec(migration.sql);
  db.exec("INSERT INTO projects VALUES('p','Keep plan','','2026-11-08'); PRAGMA user_version=11;"); db.close();
  const store = await openWorkspaceStore(path); try { assert.equal(store.projects.view('p').projects[0]!.title, 'Keep plan'); } finally { store.close(); }
  const backup = (await readdir(join(root, 'backups'))).find(name => name.endsWith('.db'))!;
  await restoreSnapshot(join(root, 'backups', backup), join(root, 'recovered.db'));
  const old = new DatabaseSync(join(root, 'recovered.db')); try { assert.equal(schemaVersion(old), 11); assert.equal(old.prepare("SELECT name FROM sqlite_schema WHERE name='linked_work'").get(), undefined); } finally { old.close(); }
});

test('recognized Issue fields tolerate ordinary line endings but reject another task marker', () => {
  const id = randomUUID(), content = { ticketId: id, title: 'Title', description: 'Description', acceptanceCriteria: 'Steps', prerequisites: [], privatePrerequisites: 0 };
  const issue = { number: 10, title: '[10] Title', body: issueBody(content).replace(/\n/g, '\r\n') + '\r\n', state: 'open' as const, updatedAt: at };
  assert.deepEqual(issueFields(issue, id), { title: 'Title', description: 'Description', acceptanceCriteria: 'Steps' });
  assert.equal(issueFields(issue, randomUUID()), null);
});
