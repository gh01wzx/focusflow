import test from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { mkdtemp, rm, writeFile, symlink, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { CodexClient, record } from '../src/codex/client.ts';
import { controlledWriteTurn, MARKERS } from '../src/codex/write-trial.ts';
import { AFTER, GUARD, fixtureFiles, seedTrial, verifyTrial, verifyGuard } from '../src/codex/write-trial-fixture.ts';

const commands = { unit: 'unit-command', boundary: 'boundary-command', network: 'network-command' };
function fixture() {
  const input = new PassThrough();
  const output = new PassThrough();
  const client = new CodexClient(input, output, 1000);
  const sent: Record<string, unknown>[] = [];
  output.on('data', chunk => sent.push(JSON.parse(String(chunk)) as Record<string, unknown>));
  const reply = (value: unknown) => { input.write(JSON.stringify(value) + '\n'); };
  const event = (method: string, params: Record<string, unknown>) => reply({ method, params: { threadId: 't', turnId: 'u', ...params } });
  const done = (status = 'completed', extra: Record<string, unknown> = {}) => event('turn/completed', { turn: { id: 'u', status, ...extra } });
  const ready = async () => { const p = client.initialize(); reply({ id: 1, result: {} }); await p; };
  return { input, output, client, sent, reply, event, done, ready };
}
type Fixture = ReturnType<typeof fixture>;
async function session(onTurn: (f: Fixture) => void, interruptStatus: string | null = 'interrupted', acknowledge = true) {
  const f = fixture(); await f.ready();
  f.output.on('data', chunk => {
    const m = record(JSON.parse(String(chunk)));
    if (m.method === 'thread/start') f.reply({ id: m.id, result: { thread: { id: 't' } } });
    if (m.method === 'turn/start') {
      f.event('turn/started', { turn: { id: 'u' } });
      onTurn(f);
      f.reply({ id: m.id, result: { turn: { id: 'u' } } });
    }
    if (m.method === 'turn/interrupt') {
      if (interruptStatus) f.done(interruptStatus);
      if (acknowledge) f.reply({ id: m.id, result: {} });
    }
  });
  return f;
}
function completedChecks(f: Fixture) {
  for (const key of ['unit', 'boundary', 'network'] as const) {
    f.event('item/completed', { item: { type: 'commandExecution', command: commands[key],
      exitCode: 0, aggregatedOutput: MARKERS[key] + '\n' } });
  }
}

test('write trial requests bounded workspace policy and correlates a terminal before start response', async t => {
  const f = await session(f => { completedChecks(f); f.done(); }); t.after(() => f.client.close());
  const result = await controlledWriteTurn(f.client, '/disposable', 'toy task', { commands });
  assert.deepEqual(result, { checks: { unit: true, boundary: true, network: true }, approvalsDenied: 0, cancellationConfirmed: false });
  const thread = record(f.sent.find(m => m.method === 'thread/start')?.params);
  assert.equal(thread.sandbox, 'workspace-write'); assert.equal(thread.approvalPolicy, 'on-request');
  assert.equal(thread.approvalsReviewer, 'user'); assert.equal(thread.ephemeral, true);
  const turn = record(f.sent.find(m => m.method === 'turn/start')?.params);
  assert.deepEqual(turn.sandboxPolicy, { type: 'workspaceWrite', writableRoots: ['/disposable'],
    networkAccess: false, excludeSlashTmp: true, excludeTmpdirEnvVar: true });
  assert.equal(f.sent.filter(m => m.method === 'turn/start').length, 1);
  assert.equal(f.client.listenerCount('notification'), 0);
});

test('agent prose, other turns, changed commands and failed commands cannot establish a check', async t => {
  const f = await session(f => {
    f.event('item/completed', { item: { type: 'agentMessage', text: Object.values(MARKERS).join(' ') } });
    f.event('item/completed', { turnId: 'another', item: { type: 'commandExecution', command: commands.unit, exitCode: 0, aggregatedOutput: MARKERS.unit } });
    f.event('item/completed', { item: { type: 'commandExecution', command: commands.unit + ' extra', exitCode: 0, aggregatedOutput: MARKERS.unit } });
    f.event('item/completed', { item: { type: 'commandExecution', command: commands.unit, exitCode: 1, aggregatedOutput: MARKERS.unit } });
    f.done();
  }); t.after(() => f.client.close());
  assert.deepEqual((await controlledWriteTurn(f.client, '/disposable', 'toy', { commands })).checks,
    { unit: false, boundary: false, network: false });
});

test('known permissions are cancelled without granting or calling them successful enforcement', async t => {
  const f = await session(f => {
    for (const method of ['item/commandExecution/requestApproval', 'item/fileChange/requestApproval']) {
      f.reply({ id: 'approval', method, params: { private: 'discarded' } });
    }
    f.done();
  }); t.after(() => f.client.close());
  const result = await controlledWriteTurn(f.client, '/disposable', 'toy', { commands });
  assert.equal(result.approvalsDenied, 2); assert.equal(result.checks.boundary, false);
  assert.equal(f.sent.filter(m => record(m.result).decision === 'cancel').length, 2);
});

test('unknown tools, unknown requests and unrelated file patches stop the owned turn', async t => {
  for (const kind of ['tool', 'request', 'path']) {
    const f = await session(f => {
      if (kind === 'request') f.reply({ id: 'unsupported', method: 'unknown', params: {} });
      else f.event('item/started', { item: kind === 'tool' ? { type: 'webSearch' }
        : { type: 'fileChange', changes: [{ path: '../outside.txt' }] } });
    }); t.after(() => f.client.close());
    await assert.rejects(controlledWriteTurn(f.client, '/disposable', 'toy', { commands }), {
      code: kind === 'request' ? 'UNSUPPORTED_REQUEST' : kind === 'path' ? 'UNEXPECTED_FILE_CHANGE' : 'UNEXPECTED_TOOL',
    });
    assert.equal(f.sent.filter(m => m.method === 'turn/interrupt').length, 1);
  }
});

test('write cancellation needs both matching interrupted terminal and acknowledgement', async t => {
  for (const [status, ack] of [['interrupted', true], ['completed', true], [null, true], ['interrupted', false]] as const) {
    const f = await session(() => {}, status, ack); t.after(() => f.client.close());
    const p = controlledWriteTurn(f.client, '/disposable', 'cancel', { commands, cancelOnStarted: true, interruptTimeoutMs: 15 });
    if (status === 'interrupted' && ack) assert.equal((await p).cancellationConfirmed, true);
    else await assert.rejects(p, { code: 'CANCELLATION_NOT_CONFIRMED' });
    assert.equal(f.sent.filter(m => m.method === 'turn/interrupt').length, 1);
    assert.equal(f.client.listenerCount('notification'), 0);
  }
});

test('another turn terminal cannot confirm cancellation', async t => {
  const f = await session(() => {}, null); t.after(() => f.client.close());
  f.output.on('data', chunk => {
    if (record(JSON.parse(String(chunk))).method === 'turn/interrupt') f.event('turn/completed', { turnId: 'other', turn: { id: 'other', status: 'interrupted' } });
  });
  await assert.rejects(controlledWriteTurn(f.client, '/disposable', 'cancel', { commands, cancelOnStarted: true, interruptTimeoutMs: 15 }),
    { code: 'CANCELLATION_NOT_CONFIRMED' });
});

test('structured failures are sanitized and a bounded pending start can be aborted', async t => {
  const f = await session(f => f.done('failed', { error: { codexErrorInfo: 'sandboxError', message: 'private' } }));
  t.after(() => f.client.close());
  await assert.rejects(controlledWriteTurn(f.client, '/disposable', 'toy', { commands }),
    { code: 'SANDBOX_FAILED', message: 'Codex write trial blocked: SANDBOX_FAILED' });
  for (const mode of ['timeout', 'abort', 'already-aborted']) {
    const g = fixture(); await g.ready(); t.after(() => g.client.close());
    const signal = new AbortController();
    if (mode === 'already-aborted') signal.abort();
    const p = controlledWriteTurn(g.client, '/disposable', 'toy', { commands, signal: signal.signal, timeoutMs: 15 });
    if (mode === 'abort') signal.abort();
    await assert.rejects(p, { code: mode === 'timeout' ? 'TURN_TIMEOUT' : 'CANCELLED' });
    assert.equal(g.sent.filter(m => m.method === 'turn/start').length, 0);
  }
});

test('fixture verifies exact result, untouched checks and no extra files; unit check really runs', async t => {
  const cwd = await mkdtemp(join(tmpdir(), 'focusflow-write-test-'));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  const files = fixtureFiles(join(cwd, 'outside'), 'http://127.0.0.1:1/trial');
  await seedTrial(cwd, files);
  await assert.rejects(verifyTrial(cwd, files), { code: 'WORKSPACE_RESULT_MISMATCH' });
  await writeFile(join(cwd, 'trial.ts'), AFTER); await verifyTrial(cwd, files);
  const result = await promisify(execFile)(process.execPath, [join(cwd, 'unit.ts')], { cwd });
  assert.equal(result.stdout.trim(), MARKERS.unit);
  await writeFile(join(cwd, 'unit.ts'), 'changed');
  await assert.rejects(verifyTrial(cwd, files), { code: 'WORKSPACE_RESULT_MISMATCH' });
  await writeFile(join(cwd, 'unit.ts'), files['unit.ts']!);
  await writeFile(join(cwd, 'extra'), 'unexpected');
  await assert.rejects(verifyTrial(cwd, files), { code: 'UNEXPECTED_WORKSPACE_FILES' });
});

test('outside sentinel and network observations are independent of model reports', async t => {
  const cwd = await mkdtemp(join(tmpdir(), 'focusflow-write-guard-test-'));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  const guard = join(cwd, 'sentinel');
  await writeFile(guard, GUARD); await verifyGuard(guard, 0);
  await assert.rejects(verifyGuard(guard, 1), { code: 'NETWORK_ACCESS_OBSERVED' });
  await writeFile(guard, 'changed');
  await assert.rejects(verifyGuard(guard, 0), { code: 'OUTSIDE_WRITE_OBSERVED' });
  await rm(guard); const target = join(cwd, 'target'); await writeFile(target, GUARD);
  await symlink(target, guard, 'file');
  await assert.rejects(verifyGuard(guard, 0), { code: 'OUTSIDE_WRITE_OBSERVED' });
});

test('default trial command prints scope without runtime, profile, files or model turns', async t => {
  const cwd = await mkdtemp(join(tmpdir(), 'focusflow-write-scope-'));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  const extension = import.meta.url.endsWith('.ts') ? '.ts' : '.js';
  const script = fileURLToPath(new URL('../scripts/codex-write-trial' + extension, import.meta.url));
  const result = await promisify(execFile)(process.execPath, [script], { cwd,
    env: { ...process.env, LOCALAPPDATA: join(cwd, 'missing-runtime') } });
  const report = record(JSON.parse(result.stdout));
  assert.equal(report.status, 'scope-only'); assert.equal(report.live, false); assert.equal(report.maximumTurns, 2);
  assert.deepEqual(await readdir(cwd), []);
});
