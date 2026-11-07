import test from 'node:test';
import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setImmediate as tick } from 'node:timers/promises';
import { DatabaseSync } from 'node:sqlite';
import { openWorkspaceStore } from '../src/workspace/store.ts';
import { createPublicationService } from '../src/publication/service.ts';
import type { IssueProvider, RemoteIssue } from '../src/publication/service.ts';
import { issueBody, parsePublicationState, IssueCreationRefused } from '../src/shared/publication.ts';
import { createGitHubService } from '../src/github/service.ts';
import type { GitHubVault } from '../src/github/vault.ts';
import { createPublicationClient } from '../src/client/publication.ts';
import { startWorkspaceServer } from '../src/workspace/server.ts';
import { MIGRATIONS } from '../src/database/schema.ts';
import { restoreSnapshot, schemaVersion } from '../src/database/backup.ts';

const repo = { id: 7, fullName: 'sample/work', private: false };
async function fixture(t: TestContext) {
  const root = await mkdtemp(join(tmpdir(), 'focusflow-publication-'));
  let cleanup = async () => {};
  t.after(async () => { await cleanup(); await service.close(); try { store.close(); } catch {} await rm(root, { recursive: true, force: true }); });
  const path = join(root, 'tracker.db'); const store = await openWorkspaceStore(path);
  const project = store.projects.addProject({ title: 'PRIVATE project notes' });
  const draft = { id: randomUUID(), projectId: project.id, goal: 'PRIVATE goal', createdAt: new Date().toISOString(), plan: { milestones: [
    { key: 'goal', title: 'PRIVATE milestone', description: '', tickets: [
      { key: 'manual', title: 'PRIVATE manual title', description: 'PRIVATE manual details', acceptanceCriteria: 'PRIVATE acceptance', executionMode: 'manual' as const, prerequisiteKeys: [] },
      { key: 'first', title: 'First coding task', description: 'Public first description', acceptanceCriteria: 'Public first steps', executionMode: 'codex' as const, prerequisiteKeys: ['manual'] },
      { key: 'second', title: 'Second coding task', description: 'Public second description', acceptanceCriteria: 'Public second steps', executionMode: 'codex' as const, prerequisiteKeys: ['first'] },
    ] },
  ] } };
  store.planDrafts.save(draft); store.planApproval.approve(project.id, { draftId: draft.id, revision: draft.id, confirm: true });
  let creates = 0, updates = 0, lose = 0; let updateFailure = false;
  const remote = new Map<number, RemoteIssue>();
  const provider: IssueProvider = {
    inspect: async () => repo,
    find: async (_projectId, _repo, marker) => [...remote.values()].filter(issue => issue.body.includes(marker)).map(issue => ({ ...issue })),
    async create(_projectId, _repo, title, body) {
      const issue = { number: ++creates, title, body }; remote.set(issue.number, issue);
      if (lose === creates) throw new Error('Lost remote reply with private token');
      return { ...issue };
    },
    async update(_projectId, _repo, number, title, body) {
      updates++; if (updateFailure) throw new Error('Provider refused update');
      const issue = { number, title, body }; remote.set(number, issue); return issue;
    },
  };
  let service = createPublicationService(store.publications, store.projects, store.projectTransaction, provider);
  const finish = async () => { for (let i = 0; i < 100 && service.state(project.id).busy; i++) await tick(); assert.equal(service.state(project.id).busy, false); };
  return { root, path, project, draft, store, provider, remote, finish, get service() { return service; },
    reopen: () => { service = createPublicationService(store.publications, store.projects, store.projectTransaction, provider); },
    onCleanup: (next: () => Promise<void>) => { cleanup = next; }, lose: (number: number) => { lose = number; }, failUpdate: (value: boolean) => { updateFailure = value; },
    counts: () => ({ creates, updates }) };
}

test('batch preview excludes private context; approval publishes one canonical Issue per coding task without starting', async t => {
  const f = await fixture(t);
  assert.equal(f.service.state(f.project.id).batch, null);
  const preview = await f.service.preview(f.project.id); assert.equal(f.counts().creates, 0);
  assert.equal(preview.batch!.items.length, 2);
  for (const item of preview.batch!.items) assert.doesNotMatch(issueBody(item.content), /PRIVATE/);
  const input = { batchId: preview.batch!.id, confirm: true };
  assert.throws(() => f.service.start(f.project.id, { ...input, confirm: false }));
  f.service.start(f.project.id, input); assert.throws(() => f.service.start(f.project.id, input));
  await f.finish(); const result = f.service.state(f.project.id);
  assert.ok(result.batch!.items.every(item => item.stage === 'published'));
  assert.equal(f.remote.get(1)!.title, '[1] First coding task'); assert.match(f.remote.get(2)!.body, /#1 First coding task/);
  assert.match(f.remote.get(1)!.body, /manual prerequisite\(s\) tracked privately/);
  assert.ok(f.store.projects.view(f.project.id).tickets.every(ticket => ticket.status === 'backlog'));
  f.service.start(f.project.id, input); await f.finish(); assert.equal(f.counts().creates, 2);
  const coding = f.store.projects.view(f.project.id).tickets.filter(ticket => ticket.executionMode === 'codex');
  assert.deepEqual(coding.map(ticket => ticket.coding!.issueNumber), [1, 2]);
  assert.throws(() => f.store.projects.editTicket(coding[0]!.id, { title: 'Unapproved change' }), /Reconcile/);
  assert.throws(() => f.store.projects.setPrerequisites(coding[0]!.id, { prerequisiteIds: [] }), /Reconcile/);
  assert.throws(() => f.store.projects.assertRepositoryChange(f.project.id, 8), /repository/);
  assert.throws(() => f.store.projects.start(coding[0]!.id), /verified coding runner/);
  assert.deepEqual(parsePublicationState(result), result); await f.service.close();
});

test('lost create reply and service restart recover the existing Issue before continuing; no duplicate POST', async t => {
  const f = await fixture(t); f.lose(2);
  const preview = await f.service.preview(f.project.id); const input = { batchId: preview.batch!.id, confirm: true };
  f.service.start(f.project.id, input); await f.finish();
  assert.deepEqual(f.service.state(f.project.id).batch!.items.map(item => item.stage), ['linked', 'uncertain']);
  assert.equal(f.counts().creates, 2); await f.service.close(); f.reopen();
  f.service.start(f.project.id, input); await f.finish();
  assert.ok(f.service.state(f.project.id).batch!.items.every(item => item.stage === 'published')); assert.equal(f.counts().creates, 2);
  const snapshot = await f.store.snapshot(); await restoreSnapshot(snapshot.path, join(f.root, 'recovered.db'));
  const restored = await openWorkspaceStore(join(f.root, 'recovered.db'));
  try { assert.deepEqual(restored.publications.read(f.project.id), f.store.publications.read(f.project.id)); }
  finally { restored.close(); }
  await f.service.close();
});

test('uncertain absent or duplicate markers cannot trigger a second creation, and foreign edits are not overwritten', async t => {
  const f = await fixture(t); f.lose(1);
  const preview = await f.service.preview(f.project.id); const input = { batchId: preview.batch!.id, confirm: true };
  f.service.start(f.project.id, input); await f.finish(); const remote = f.remote.get(1)!; f.remote.clear();
  f.service.start(f.project.id, input); await f.finish(); assert.equal(f.counts().creates, 1);
  assert.equal(f.service.state(f.project.id).batch!.items[0]!.stage, 'uncertain');
  f.remote.set(1, remote); f.remote.set(5, { ...remote, number: 5 });
  f.service.start(f.project.id, input); await f.finish(); assert.equal(f.counts().creates, 1);
  assert.equal(f.service.state(f.project.id).batch!.items[0]!.stage, 'conflict');
  f.remote.delete(5); f.remote.set(1, { ...remote, title: 'External edit' });
  f.service.start(f.project.id, input); await f.finish(); assert.equal(f.remote.get(1)!.title, 'External edit'); assert.equal(f.counts().updates, 0);
  await f.service.close();
});

test('changed local preview is rejected; failed final title update retains its number and retries only PATCH', async t => {
  const f = await fixture(t);
  let preview = await f.service.preview(f.project.id); const ticket = f.store.projects.view(f.project.id).tickets.find(t => t.executionMode === 'codex')!;
  f.store.projects.editTicket(ticket.id, { title: 'Changed title' });
  assert.throws(() => f.service.start(f.project.id, { batchId: preview.batch!.id, confirm: true }), /changed/);
  preview = await f.service.preview(f.project.id); f.failUpdate(true);
  f.service.start(f.project.id, { batchId: preview.batch!.id, confirm: true }); await f.finish(); assert.equal(f.counts().creates, 2);
  assert.ok(f.service.state(f.project.id).batch!.items.every(item => item.issueNumber !== null));
  f.failUpdate(false); f.service.start(f.project.id, { batchId: preview.batch!.id, confirm: true }); await f.finish();
  assert.equal(f.counts().creates, 2); assert.ok(f.service.state(f.project.id).batch!.items.every(item => item.stage === 'published'));
  await f.service.close();
});

test('GitHub adapter checks repository identity, filters pull requests, uses approved bodies and refuses secret-bearing failures', async () => {
  const id = randomUUID(); const requests: { url: string; method: string; body: string }[] = [];
  let renamed = false;
  const vault: GitHubVault = { available: async () => true, read: async () => ({ clientId: 'Iv.fixture', token: 'ghu_fixture_token', account: 'sample', expiresAt: null, repositories: { [id]: repo } }),
    write: async () => {}, clear: async () => {} };
  const github = createGitHubService(vault, async (url, input) => {
    requests.push({ url: String(url), method: input?.method ?? 'GET', body: String(input?.body ?? '') });
    if (String(url).endsWith('/repos/sample/work')) return Response.json({ id: 7, full_name: renamed ? 'sample/renamed' : 'sample/work', private: false });
    if (input?.method === 'POST' || input?.method === 'PATCH') return Response.json({ number: 1, ...JSON.parse(String(input.body)) });
    return Response.json([{ number: 1, title: 'Title', body: 'marker' }, { pull_request: {}, body: 'marker' }]);
  });
  assert.deepEqual(await github.issues.inspect(id), repo); assert.equal((await github.issues.find(id, repo, 'marker')).length, 1);
  await github.issues.create(id, repo, 'Title', 'Approved body');
  await github.issues.update(id, repo, 1, '[1] Title', 'Approved body');
  assert.equal(requests.filter(r => r.method === 'POST').length, 1); assert.ok(requests.some(r => r.url.includes('state=all&per_page=100')));
  renamed = true; await assert.rejects(github.issues.create(id, repo, 'No', 'No'), /identity or visibility/);
  assert.equal(requests.filter(r => r.method === 'POST').length, 1); await github.close();
});

test('publication HTTP enforces origin and project identity, and unavailable GitHub never publishes', async t => {
  const f = await fixture(t); f.store.close();
  const server = await startWorkspaceServer({ dataDirectory: f.root });
  f.onCleanup(() => server.close());
  const transport: typeof fetch = (path, input) => fetch(server.origin + String(path), { ...input, headers: { ...input?.headers, Origin: server.origin } });
  const client = createPublicationClient(transport);
  assert.equal((await client.read(f.project.id)).batch, null); await assert.rejects(client.preview(f.project.id), /Windows GitHub/);
  const response = await fetch(server.origin + `/api/projects/${f.project.id}/publication/publish`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(response.status, 403); await assert.rejects(client.read(randomUUID()), /not found/);
});

test('format 10 upgrades with a restorable unchanged pre-publication snapshot', async t => {
  const root = await mkdtemp(join(tmpdir(), 'focusflow-publication-upgrade-')); t.after(() => rm(root, { recursive: true, force: true }));
  const path = join(root, 'tracker.db'), db = new DatabaseSync(path);
  for (const migration of MIGRATIONS.filter(value => value.version <= 10)) db.exec(migration.sql);
  db.exec("INSERT INTO projects VALUES('p','Keep plan','','2026-11-08'); PRAGMA user_version=10;"); db.close();
  const store = await openWorkspaceStore(path); try { assert.equal(store.projects.view('p').projects[0]!.title, 'Keep plan'); } finally { store.close(); }
  const backup = (await readdir(join(root, 'backups'))).find(name => name.endsWith('.db'))!;
  await restoreSnapshot(join(root, 'backups', backup), join(root, 'recovered.db'));
  const old = new DatabaseSync(join(root, 'recovered.db'));
  try { assert.equal(schemaVersion(old), 10); assert.equal(old.prepare("SELECT name FROM sqlite_schema WHERE name='publication_batches'").get(), undefined); }
  finally { old.close(); }
});

test('a definite creation refusal retains pending work for explicit retry without changing its approved content', async t => {
  const f = await fixture(t); let refused = true;
  const provider = { ...f.provider, create: (...args: Parameters<IssueProvider['create']>) => {
    if (refused) throw new IssueCreationRefused('Denied'); return f.provider.create(...args);
  } };
  const service = createPublicationService(f.store.publications, f.store.projects, f.store.projectTransaction, provider);
  const preview = await service.preview(f.project.id), input = { batchId: preview.batch!.id, confirm: true };
  service.start(f.project.id, input);
  for (let i = 0; i < 100 && service.state(f.project.id).busy; i++) await tick();
  assert.equal(service.state(f.project.id).batch!.items[0]!.stage, 'pending'); assert.equal(f.counts().creates, 0);
  assert.throws(() => f.store.projects.editTicket(preview.batch!.items[0]!.content.ticketId, { title: 'Not yet allowed' }), /Reconcile/);
  service.abandon(f.project.id, { ...input });
  assert.equal(service.state(f.project.id).batch, null);
  f.store.projects.editTicket(preview.batch!.items[0]!.content.ticketId, { title: 'Corrected before publication' });
  const replacement = await service.preview(f.project.id);
  assert.throws(() => service.start(f.project.id, input));
  refused = false; service.start(f.project.id, { batchId: replacement.batch!.id, confirm: true });
  for (let i = 0; i < 100 && service.state(f.project.id).busy; i++) await tick();
  assert.equal(f.counts().creates, 2); assert.ok(service.state(f.project.id).batch!.items.every(item => item.stage === 'published')); await service.close();
});

test('closing during an owned GitHub creation aborts transport before closing SQLite and preserves uncertainty', async t => {
  const f = await fixture(t); f.store.close();
  let entered!: () => void; const started = new Promise<void>(resolve => { entered = resolve; }); let aborted = false;
  const vault: GitHubVault = { available: async () => true, read: async () => ({ clientId: 'Iv.fixture', token: 'ghu_fixture_token', account: 'sample', expiresAt: null,
    repositories: { [f.project.id]: repo } }), write: async () => {}, clear: async () => {} };
  const github = createGitHubService(vault, async (url, input) => {
    if (String(url).endsWith('/repos/sample/work')) return Response.json({ id: repo.id, full_name: repo.fullName, private: false });
    if (input?.method === 'POST') {
      entered(); await new Promise<never>((_resolve, reject) => input.signal!.addEventListener('abort', () => { aborted = true; reject(new Error('aborted')); }, { once: true }));
    }
    return Response.json([]);
  });
  const server = await startWorkspaceServer({ dataDirectory: f.root, github }); f.onCleanup(() => server.close());
  const transport: typeof fetch = (path, input) => fetch(server.origin + String(path), { ...input, headers: { ...input?.headers, Origin: server.origin } });
  const client = createPublicationClient(transport), preview = await client.preview(f.project.id);
  await client.publish(f.project.id, preview.batch!.id, true); await started; await server.close(); assert.equal(aborted, true);
  const restored = await openWorkspaceStore(f.path);
  try { assert.equal(restored.publications.read(f.project.id)!.items[0]!.stage, 'uncertain'); assert.equal(restored.projects.view(f.project.id).tickets.every(ticket => ticket.status === 'backlog'), true); }
  finally { restored.close(); }
});
