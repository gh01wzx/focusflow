import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createGitHubService } from '../src/github/service.ts';
import { createGitHubVault } from '../src/github/vault.ts';
import type { GitHubVault, StoredGitHub } from '../src/github/vault.ts';
import { createGitHubClient } from '../src/client/github.ts';
import { startWorkspaceServer } from '../src/workspace/server.ts';
import { openWorkspaceStore } from '../src/workspace/store.ts';
import { createProjectClient } from '../src/client/projects.ts';
import { repositoryName, parseGitHubStatus } from '../src/shared/github.ts';

const projectId = '00000000-0000-0000-0000-000000000001';
const token = 'ghu_fixture_token_only';
const repo = { id: 7, full_name: 'sample/work', private: false };

test('server shutdown interrupts HTTP, aborts owned GitHub work and retains accepted project data', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'focusflow-github-close-'));
  const saved = memory();
  await saved.vault.write({ clientId: 'Iv1.fixture', token, account: 'sample', expiresAt: null, repositories: {} });
  let entered!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; });
  let aborted = false;
  const service = createGitHubService(saved.vault, async (_url, options) => {
    entered();
    await new Promise<never>((_resolve, reject) => options?.signal?.addEventListener('abort', () => {
      aborted = true; reject(new Error('Fixture network aborted'));
    }, { once: true }));
    return Response.json({});
  });
  const server = await startWorkspaceServer({ dataDirectory: directory, github: service });
  t.after(async () => { await server.close(); await rm(directory, { recursive: true, force: true }); });
  const transport: typeof fetch = (path, options) => fetch(server.origin + String(path), {
    ...options, headers: { ...options?.headers, Origin: server.origin },
  });
  const fixtureTransport: typeof fetch = (path, options) => transport(path, {
    ...options, headers: { ...options?.headers, Connection: 'close' },
  });
  const project = await createProjectClient(fixtureTransport).addProject({ title: 'Keep work on close', description: '' });
  const request = createGitHubClient(fixtureTransport).act(project.selectedProjectId!, 'inspect', { name: 'sample/work' });
  const interrupted = assert.rejects(request, TypeError);
  await started;
  const before = Date.now();
  await server.close(); await interrupted;
  assert.equal(aborted, true);
  assert.ok(Date.now() - before < 1000, 'Shutdown must not wait for the provider timeout.');
  const reopened = await openWorkspaceStore(join(directory, 'tracker.db'));
  try { assert.equal(reopened.projects.view().projects[0]?.title, 'Keep work on close'); }
  finally { reopened.close(); }
});
function memory() {
  let value: StoredGitHub | null = null;
  const vault: GitHubVault = { available: async () => true,
    read: async () => value && structuredClone(value),
    write: async next => { value = structuredClone(next); }, clear: async () => { value = null; } };
  return { vault, read: () => value };
}
function fixture() {
  const memoryVault = memory();
  let clock = 10000;
  let mode = 'success';
  let repository = { ...repo };
  const calls: { path: string; method: string; body: string }[] = [];
  const transport: typeof fetch = async (url, options) => {
    const path = String(url);
    calls.push({ path, method: options?.method ?? 'GET', body: String(options?.body ?? '') });
    if (mode === 'network') throw new Error('sensitive provider detail');
    if (mode === 'revoked') return new Response('{}', { status: 401 });
    if (mode === 'denied') return new Response('{}', { status: 403 });
    if (path.endsWith('/device/code')) return Response.json({
      device_code: 'private_device_fixture', user_code: 'ABCD-EFGH',
      verification_uri: 'https://github.com/login/device', expires_in: 900, interval: 1,
    });
    if (path.endsWith('/oauth/access_token')) return Response.json(mode === 'slow'
      ? { error: 'slow_down' } : mode === 'pending' ? { error: 'authorization_pending' }
      : { access_token: token, refresh_token: 'never_store_refresh_fixture', expires_in: 28800 });
    if (path.endsWith('/user')) return Response.json({ login: 'sample', email: 'not-exposed@example.test' });
    if (path.includes('/user/repos?')) return Response.json([repository]);
    return Response.json(repository);
  };
  const service = createGitHubService(memoryVault.vault, transport, () => clock);
  return { ...memoryVault, service, calls, mode: (value: string) => { mode = value; },
    repository: (value: typeof repo) => { repository = value; },
    advance: (value = 1000) => { clock += value; } };
}
async function authorize(f: ReturnType<typeof fixture>) {
  const status = await f.service.start(projectId, 'Iv1.fixture');
  assert.equal(status.userCode, 'ABCD-EFGH');
  assert.equal(f.calls[0]?.body, 'client_id=Iv1.fixture');
  f.advance();
  assert.equal((await f.service.poll(projectId)).connected, true);
}

test('confirmation belongs to one project and rejects repository renames or visibility changes', async () => {
  const f = fixture(); await authorize(f);
  const other = '00000000-0000-0000-0000-000000000002';
  await f.service.inspect(projectId, 'sample/work');
  assert.equal((await f.service.status(other)).preview, null);
  assert.equal((await f.service.connect(other, true, 7)).repository, null);
  f.repository({ ...repo, full_name: 'sample/renamed' });
  const renamed = await f.service.connect(projectId, true, 7);
  assert.equal(renamed.repository, null); assert.equal(renamed.preview, null);
  assert.match(renamed.message, /changed/);
  f.repository({ ...repo, private: true });
  await f.service.inspect(projectId, 'sample/work');
  f.repository({ ...repo, private: false });
  const publicNow = await f.service.connect(projectId, true, 7);
  assert.equal(publicNow.repository, null); assert.match(publicNow.message, /visibility/);
  await f.service.inspect(projectId, 'sample/work');
  assert.equal((await f.service.connect(projectId, true, 7)).repository?.private, false);
  await f.service.close();
});

test('failed inspections clear old previews and expired access sends no provider request', async () => {
  const f = fixture(); await authorize(f);
  await f.service.inspect(projectId, 'sample/work');
  f.mode('network');
  assert.equal((await f.service.inspect(projectId, 'sample/other')).preview, null);
  assert.equal((await f.service.connect(projectId, true, 7)).repository, null);
  f.mode('success'); f.advance(29_000_000);
  const before = f.calls.length;
  assert.equal((await f.service.inspect(projectId, 'sample/work')).connected, false);
  assert.equal(f.calls.length, before);
  await f.service.close();
});

test('GitHub App device authorization lists, previews and explicitly links without external writes', async () => {
  const f = fixture();
  await authorize(f);
  const checked = await f.service.check(projectId);
  assert.equal(checked.account, 'sample');
  assert.equal(checked.repositories[0]?.fullName, 'sample/work');
  assert.match((await f.service.connect(projectId, true, 7)).message, /Inspect/);
  const preview = await f.service.inspect(projectId, 'sample/work');
  assert.equal(preview.preview?.private, false);
  assert.equal((await f.service.connect(projectId, false, 7)).repository, null);
  assert.equal((await f.service.connect(projectId, true, 8)).repository, null);
  assert.equal((await f.service.connect(projectId, true, 7)).repository?.fullName, 'sample/work');
  assert.equal((await f.service.status('00000000-0000-0000-0000-000000000002')).repository, null);
  const serialized = JSON.stringify(await f.service.status(projectId));
  for (const secret of [token, 'private_device_fixture', 'never_store_refresh_fixture', 'not-exposed@example.test']) {
    assert.equal(serialized.includes(secret), false);
  }
  assert.equal(JSON.stringify(f.read()).includes('refresh'), false);
  assert.ok(f.calls.every(call => call.method === 'GET'
    ? call.path.startsWith('https://api.github.com/')
    : ['https://github.com/login/device/code', 'https://github.com/login/oauth/access_token'].includes(call.path)));
  const restarted = createGitHubService(f.vault, async () => { throw new Error('Status must stay local'); }, () => 10000);
  assert.equal((await restarted.status(projectId)).repository?.id, 7);
  await f.service.disconnect(projectId);
  assert.equal(f.read(), null);
  assert.equal((await f.service.status(projectId)).repository, null);
  await f.service.close();
});

test('device polling respects intervals, slow-down, cancellation, expiry and redacted errors', async () => {
  const f = fixture();
  await f.service.start(projectId, 'Iv1.fixture');
  await f.service.poll(projectId);
  assert.equal(f.calls.length, 1);
  f.advance(); f.mode('slow');
  const slowed = await f.service.poll(projectId);
  assert.equal(slowed.nextPollAt, 17000);
  f.advance(); await f.service.poll(projectId);
  assert.equal(f.calls.length, 2);
  f.advance(5000); f.mode('pending');
  assert.match((await f.service.poll(projectId)).message, /Waiting/);
  await f.service.cancel(projectId);
  f.advance(10000); await f.service.poll(projectId);
  assert.equal(f.calls.length, 3);
  f.mode('success'); await f.service.start(projectId, 'Iv1.fixture');
  f.advance(901000);
  assert.match((await f.service.poll(projectId)).message, /expired/);
  f.mode('network');
  const failure = await f.service.start(projectId, 'Iv1.fixture');
  assert.match(failure.message, /network/);
  assert.equal(JSON.stringify(failure).includes('sensitive'), false);
  await f.service.close();
});

test('revoked and insufficient GitHub permissions preserve links while refusing account use', async () => {
  const f = fixture(); await authorize(f);
  await f.service.inspect(projectId, 'sample/work');
  await f.service.connect(projectId, true, 7);
  f.mode('denied');
  assert.match((await f.service.check(projectId)).message, /permissions/);
  f.mode('revoked');
  assert.equal((await f.service.check(projectId)).connected, false);
  assert.equal(f.read()?.token, '');
  assert.equal((await f.service.status(projectId)).repository?.id, 7);
  assert.match((await f.service.inspect(projectId, 'https://evil.test/repo')).message, /owner\/name/);
  for (const name of ['https://evil.test', '../x', 'owner/..', 'owner/x?secret', 'owner/x/y']) {
    assert.throws(() => repositoryName(name));
  }
  assert.throws(() => parseGitHubStatus({}));
  await f.service.close();
});

test('disconnect waits for an in-flight authorization write and removes the final credential', async () => {
  const f = fixture();
  const original = f.vault.write;
  let release!: () => void;
  let reached!: () => void;
  const writing = new Promise<void>(resolve => { reached = resolve; });
  const hold = new Promise<void>(resolve => { release = resolve; });
  f.vault.write = async value => { reached(); await hold; await original(value); };
  await f.service.start(projectId, 'Iv1.fixture'); f.advance();
  const polling = f.service.poll(projectId);
  await writing;
  const disconnect = f.service.disconnect(projectId);
  release(); await polling; await disconnect;
  assert.equal(f.read(), null);
  assert.equal((await f.service.status(projectId)).connected, false);
  await f.service.close();
});

test('credential vault writes only encrypted bytes and refuses plaintext fallback', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'focusflow-github-vault-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  let available = true;
  // Fixture codec checks the vault contract; installed smoke checks actual Windows safeStorage.
  const vault = createGitHubVault(directory, { available: async () => available,
    encrypt: async value => Buffer.from(Uint8Array.from(Buffer.from(value), byte => byte ^ 0xa5)),
    decrypt: async value => Buffer.from(Uint8Array.from(value, byte => byte ^ 0xa5)).toString() });
  assert.equal(await vault.read(), null);
  const value: StoredGitHub = { clientId: 'Iv1.fixture', token, account: 'sample', expiresAt: null,
    repositories: { [projectId]: { id: 7, fullName: 'sample/work', private: true } } };
  await vault.write(value); await vault.write(value);
  assert.deepEqual(await vault.read(), value);
  assert.equal((await readFile(join(directory, 'connection.bin'))).includes(Buffer.from(token)), false);
  assert.deepEqual(await readdir(directory), ['connection.bin']);
  available = false;
  await assert.rejects(vault.write(value), /OS-protected/);
  await assert.rejects(vault.read(), /OS-protected/);
  await vault.clear();
});

test('real HTTP GitHub routes require an existing project, same origin and checked responses', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'focusflow-github-http-'));
  const f = fixture();
  const server = await startWorkspaceServer({ dataDirectory: directory, github: f.service });
  t.after(async () => { await server.close(); await rm(directory, { recursive: true, force: true }); });
  const transport: typeof fetch = (path, options) => fetch(server.origin + String(path), {
    ...options, headers: { ...options?.headers, Origin: server.origin },
  });
  const projects = createProjectClient(transport);
  const project = await projects.addProject({ title: 'Keep manual tasks', description: '' });
  const id = project.selectedProjectId!;
  const client = createGitHubClient(transport);
  assert.equal((await client.read(id)).connected, false);
  assert.equal((await client.act(id, 'start', { clientId: 'Iv1.fixture' })).userCode, 'ABCD-EFGH');
  await assert.rejects(client.read(projectId), /not found/i);
  const url = server.origin + '/api/projects/' + id + '/github/disconnect';
  assert.equal((await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 403);
  await client.act(id, 'disconnect');
  assert.equal((await projects.read(id)).projects[0]?.title, 'Keep manual tasks');
  await assert.rejects(createGitHubClient(async () => Response.json({ connected: 'bad' })).read(id), /Could not read/);
});


test('unreadable saved credentials still expose local disconnect and allow fresh authorization', async () => {
  let unreadable = true;
  const vault: GitHubVault = {
    available: async () => true,
    read: async () => { if (unreadable) throw new Error('private unreadable fixture'); return null; },
    write: async () => {},
    clear: async () => { unreadable = false; },
  };
  const service = createGitHubService(vault, async () => Response.json({
    device_code: 'private_device_fixture', user_code: 'ABCD-EFGH',
    verification_uri: 'https://github.com/login/device', expires_in: 900, interval: 1,
  }));
  const failed = await service.status(projectId);
  assert.equal(failed.available, true, 'Keep the disconnect controls available when OS encryption works.');
  assert.equal(failed.connected, false);
  assert.match(failed.message, /Disconnect locally/);
  assert.equal(JSON.stringify(failed).includes('private unreadable'), false);
  assert.equal((await service.disconnect(projectId)).available, true);
  assert.equal((await service.start(projectId, 'Iv1.fixture')).userCode, 'ABCD-EFGH');
  await service.close();
});
