import test from 'node:test';
import assert from 'node:assert/strict';
import { connect } from 'node:net';
import type { Socket } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { listenLocal } from '../src/http/local-server.ts';
import { readJson, sendJson } from '../src/http/request.ts';
import { startWorkspaceServer } from '../src/workspace/server.ts';
import { openWorkspaceStore } from '../src/workspace/store.ts';
import { createAiService } from '../src/ai/service.ts';
import { createGitHubService } from '../src/github/service.ts';

function deferred() {
  let resolve!: () => void; const promise = new Promise<void>(yes => { resolve = yes; });
  return { promise, resolve };
}
async function bounded<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([promise, new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('Local shutdown did not settle.')), 2000);
  })]); } finally { if (timer) clearTimeout(timer); }
}
async function socketFor(origin: string): Promise<Socket> {
  const socket = connect(Number(new URL(origin).port), '127.0.0.1');
  await bounded(new Promise<void>((resolve, reject) => { socket.once('connect', resolve); socket.once('error', reject); }));
  socket.on('error', () => {}); return socket;
}
function incomplete(socket: Socket, origin: string) {
  socket.write(`POST /api/tasks HTTP/1.1\r\nHost: ${new URL(origin).host}\r\nOrigin: ${origin}\r\nContent-Type: application/json\r\nContent-Length: 128\r\n\r\n{"title":`);
}

test('close interrupts an unfinished body and pre-header connection, drains handlers and disposes once', async () => {
  const entered = deferred(); const events: string[] = [];
  const app = await listenLocal(async (request, response, origin) => {
    entered.resolve();
    try { await readJson(request, origin); assert.fail('An incomplete body cannot become a write.'); }
    catch { events.push('body-settled'); sendJson(response, 400, { error: 'Interrupted fixture' }); }
  }, () => { events.push('disposed'); });
  const partial = await socketFor(app.origin), idle = await socketFor(app.origin);
  const disconnected = Promise.all([partial, idle].map(socket => new Promise<void>(resolve => socket.once('close', () => resolve()))));
  try {
    incomplete(partial, app.origin); await bounded(entered.promise);
    const first = app.close(); assert.equal(app.close(), first);
    await bounded(first); await bounded(disconnected);
    assert.deepEqual(events, ['body-settled', 'disposed']);
  } finally { partial.destroy(); idle.destroy(); await app.close(); }
});

test('shutdown stops new connections and awaits an accepted data write before SQLite closes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'focusflow-drain-write-'));
  const path = join(root, 'tracker.db'), store = await openWorkspaceStore(path);
  const entered = deferred(), release = deferred(), cancelling = deferred(); const events: string[] = [];
  const app = await listenLocal(async (_request, response) => {
    entered.resolve(); await release.promise;
    store.tasks.add({ title: 'Accepted write survives close', plannedDate: '2026-11-07' });
    events.push('committed'); sendJson(response, 200, {});
  }, () => { events.push('database-closed'); store.close(); }, async () => { events.push('cancelled-owned-work'); cancelling.resolve(); });
  const request = fetch(app.origin).then(() => {}, () => {});
  try {
    await bounded(entered.promise); let closed = false;
    const closing = app.close().then(() => { closed = true; }); await bounded(cancelling.promise);
    assert.equal(closed, false); assert.deepEqual(events, ['cancelled-owned-work']);
    await assert.rejects(socketFor(app.origin));
    release.resolve(); await bounded(closing); await bounded(request);
    assert.deepEqual(events, ['cancelled-owned-work', 'committed', 'database-closed']);
    const reopened = await openWorkspaceStore(path);
    try { assert.equal(reopened.tasks.view().due.some(task => task.title === 'Accepted write survives close'), true); }
    finally { reopened.close(); }
  } finally { release.resolve(); await app.close(); await rm(root, { recursive: true, force: true }); }
});

test('failed owned cancellation still drains requests and closes data, while remaining a failure', async () => {
  let disposed = 0; const app = await listenLocal(async (_request, response) => { response.end(); },
    () => { disposed++; }, async () => { throw new Error('private provider details'); });
  await assert.rejects(bounded(app.close()), /LOCAL_SERVER_SHUTDOWN_FAILED/);
  await assert.rejects(app.close(), /LOCAL_SERVER_SHUTDOWN_FAILED/);
  assert.equal(disposed, 1);
});

test('workspace closes an incomplete request without a partial task, preserving prior data and phase order', async () => {
  const root = await mkdtemp(join(tmpdir(), 'focusflow-close-body-'));
  const path = join(root, 'tracker.db'); const seed = await openWorkspaceStore(path);
  seed.tasks.add({ title: 'Kept task', plannedDate: '2026-11-07' }); seed.close();
  const phases: string[] = [];
  const app = await startWorkspaceServer({ dataDirectory: root, onShutdown: stage => { phases.push(stage); } });
  const socket = await socketFor(app.origin);
  try {
    incomplete(socket, app.origin);
    // A completed same-origin read orders the experiment after the body write.
    const read = await fetch(app.origin + '/api/tasks'); await read.arrayBuffer();
    await bounded(app.close());
    assert.ok(phases.indexOf('transport:begin') < phases.indexOf('ai:end'));
    assert.ok(phases.indexOf('ai:end') < phases.indexOf('database:begin'));
    assert.ok(phases.indexOf('github:end') < phases.indexOf('database:begin'));
    assert.equal(phases.at(-1), 'workspace:closed');
    const reopened = await openWorkspaceStore(path);
    try { assert.deepEqual(reopened.tasks.view().due.map(task => task.title), ['Kept task']); }
    finally { reopened.close(); }
  } finally { socket.destroy(); await app.close(); await rm(root, { recursive: true, force: true }); }
});

test('workspace awaits every owned service even when one cancellation fails', async () => {
  const root = await mkdtemp(join(tmpdir(), 'focusflow-close-owned-'));
  const phases: string[] = [];
  const ai = createAiService({ installed: async () => false, run: async () => { throw new Error('No model'); } });
  const github = createGitHubService({ available: async () => false, read: async () => null, write: async () => {}, clear: async () => {} });
  let githubClosed = false;
  ai.close = async () => { throw new Error('Private runtime failure'); };
  github.close = async () => { githubClosed = true; };
  const app = await startWorkspaceServer({ dataDirectory: root, ai, github, onShutdown: stage => { phases.push(stage); } });
  try {
    await assert.rejects(bounded(app.close()), /LOCAL_SERVER_SHUTDOWN_FAILED/);
    assert.equal(githubClosed, true); assert.ok(phases.includes('database:end'));
    const reopened = await openWorkspaceStore(join(root, 'tracker.db')); reopened.close();
  } finally { await app.close().catch(() => {}); await rm(root, { recursive: true, force: true }); }
});
