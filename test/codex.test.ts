import test from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { CodexClient, CodexFailure, modelFailureCode } from '../src/codex/client.ts';
import { readOnlyProbe, cancelReadOnlyProbe, PROBE_MARKER } from '../src/codex/read-only-probe.ts';

function fixture(timeout = 1000, maxLine = 1024 * 1024) {
  const input = new PassThrough();
  const output = new PassThrough();
  const sent: Record<string, unknown>[] = [];
  output.on('data', chunk => sent.push(JSON.parse(String(chunk)) as Record<string, unknown>));
  const client = new CodexClient(input, output, timeout, maxLine);
  const reply = (value: unknown) => input.write(JSON.stringify(value) + '\n');
  async function initialize() {
    const ready = client.initialize();
    reply({ id: 1, result: {} });
    await ready;
  }
  return { client, input, output, sent, reply, initialize };
}

test('initialization precedes correlated requests; split JSONL and progress are handled', async t => {
  const f = fixture(); t.after(() => f.client.close());
  await assert.rejects(f.client.request('account/read', {}), { code: 'NOT_INITIALIZED' });
  await f.initialize();
  assert.deepEqual(f.sent.map(x => x.method), ['initialize', 'initialized']);
  const progress: unknown[] = [];
  f.client.on('notification', (...event: unknown[]) => progress.push(event));
  const first = f.client.request('one', {});
  const second = f.client.request('two', {});
  f.input.write('{"id":3,"result":');
  f.input.write('"second"}\n{"method":"item/agentMessage/delta","params":{"delta":"ok"}}\n');
  f.reply({ id: 2, result: 'first' });
  assert.equal(await first, 'first'); assert.equal(await second, 'second');
  assert.deepEqual(progress, [['item/agentMessage/delta', { delta: 'ok' }]]);
});

test('approval requests and unknown server requests never grant permissions', async t => {
  const f = fixture(); t.after(() => f.client.close()); await f.initialize();
  let denied = 0;
  f.client.on('approvalDenied', () => denied++);
  for (const method of ['item/commandExecution/requestApproval', 'item/fileChange/requestApproval', 'unknown']) {
    f.reply({ id: 'server-request', method, params: { secret: 'private' } });
  }
  assert.equal(denied, 3);
  assert.deepEqual(f.sent[2], { id: 'server-request', result: { decision: 'cancel' } });
  assert.deepEqual(f.sent[3], f.sent[2]);
  assert.deepEqual(f.sent[4], { id: 'server-request', error: { code: -32601, message: 'Client request is not supported' } });
});

test('interruption targets the current thread and turn', async t => {
  const f = fixture(); t.after(() => f.client.close()); await f.initialize();
  const interrupt = f.client.interrupt('thread-1', 'turn-1');
  assert.deepEqual(f.sent[2], { id: 2, method: 'turn/interrupt', params: { threadId: 'thread-1', turnId: 'turn-1' } });
  f.reply({ id: 2, result: {} }); await interrupt;
});

test('RPC error payloads cannot escape as exception messages or causes', async t => {
  const f = fixture(); t.after(() => f.client.close()); await f.initialize();
  const request = f.client.request('account/read', {});
  f.reply({ id: 2, error: { code: 401, message: 'private@example.test sk-secret', data: { token: 'private' } } });
  await assert.rejects(request, error => {
    assert.ok(error instanceof CodexFailure);
    assert.equal(error.message, 'Codex request failed: RPC_FAILED');
    assert.equal(error.cause, undefined);
    return true;
  });
});

test('timeout closes the client and rejects all in-flight requests', async () => {
  const f = fixture(15); await f.initialize();
  const one = assert.rejects(f.client.request('one', {}), { code: 'TIMEOUT' });
  const two = assert.rejects(f.client.request('two', {}), { code: 'TIMEOUT' });
  await Promise.all([one, two]);
  await assert.rejects(f.client.request('late', {}), { code: 'CLOSED' });
});

test('EOF and output errors settle pending requests without exposing process errors', async () => {
  for (const event of ['end', 'error']) {
    const f = fixture(); await f.initialize();
    const request = assert.rejects(f.client.request('waiting', {}), { code: 'CLOSED' });
    if (event === 'end') f.input.end();
    else f.output.emit('error', new Error('private process path'));
    await request;
  }
});

test('malformed, oversized and unsolicited responses close the connection', async () => {
  for (const line of ['not-json\n', 'x'.repeat(257), '{"id":99,"result":{}}\n', '[]\n']) {
    const f = fixture(1000, 256); await f.initialize();
    const request = assert.rejects(f.client.request('waiting', {}), { code: 'PROTOCOL' });
    f.input.write(line); await request;
  }
});

async function session(onTurn: (f: ReturnType<typeof fixture>) => void, interruptStatus: string | null = 'interrupted') {
  const f = fixture(); await f.initialize();
  f.output.on('data', chunk => {
    const message = JSON.parse(String(chunk)) as Record<string, unknown>;
    if (message.method === 'thread/start') f.reply({ id: message.id, result: { thread: { id: 'thread-1' } } });
    if (message.method === 'turn/start') {
      f.reply({ method: 'turn/started', params: { threadId: 'thread-1', turn: { id: 'turn-1' } } });
      onTurn(f);
      f.reply({ id: message.id, result: { turn: { id: 'turn-1' } } });
    }
    if (message.method === 'turn/interrupt') {
      if (interruptStatus) event(f, 'turn/completed', { turn: { id: 'turn-1', status: interruptStatus } });
      f.reply({ id: message.id, result: {} });
    }
  });
  return f;
}

function event(f: ReturnType<typeof fixture>, method: string, params: Record<string, unknown>) {
  f.reply({ method, params: { threadId: 'thread-1', turnId: 'turn-1', ...params } });
}

test('one read-only ephemeral turn handles completion arriving before the start response', async t => {
  const f = await session(f => {
    event(f, 'item/agentMessage/delta', { delta: PROBE_MARKER });
    event(f, 'item/completed', { item: { type: 'agentMessage', text: PROBE_MARKER } });
    event(f, 'turn/completed', { turn: { id: 'turn-1', status: 'completed' } });
  });
  t.after(() => f.client.close());
  const progress: string[] = [];
  const evidence = await readOnlyProbe(f.client, 'disposable-directory', { onProgress: kind => progress.push(kind) });
  assert.deepEqual(evidence, { status: 'verified', check: 'read-only-model-turn', deltaEvents: 1, markerMatched: true });
  const params = f.sent.find(x => x.method === 'thread/start')?.params as Record<string, unknown>;
  assert.equal(params.sandbox, 'read-only'); assert.equal(params.approvalPolicy, 'never');
  assert.equal(params.ephemeral, true); assert.deepEqual(progress, ['started', 'delta']);
  assert.equal(f.sent.filter(x => x.method === 'turn/start').length, 1);
  assert.equal(f.client.listenerCount('notification'), 0);
});

test('model failure, interrupted completion and marker mismatch cannot report success', async t => {
  for (const status of ['failed', 'interrupted', 'completed']) {
    const f = await session(f => event(f, 'turn/completed', { turn: { id: 'turn-1', status, error: { message: 'private quota details' } } }));
    t.after(() => f.client.close());
    await assert.rejects(readOnlyProbe(f.client, 'disposable-directory'), {
      code: status === 'completed' ? 'MARKER_MISMATCH' : 'TURN_NOT_COMPLETED',
    });
  }
});

test('unexpected tool use or approval is denied and interrupts only this turn', async t => {
  for (const kind of ['tool', 'approval']) {
    const f = await session(f => {
      if (kind === 'tool') event(f, 'item/started', { item: { type: 'commandExecution', command: 'private command' } });
      else f.reply({ id: 'approval-1', method: 'item/fileChange/requestApproval', params: {} });
    });
    t.after(() => f.client.close());
    await assert.rejects(readOnlyProbe(f.client, 'disposable-directory'), { code: kind === 'tool' ? 'UNEXPECTED_TOOL' : 'APPROVAL_DENIED' });
    assert.deepEqual(f.sent.find(x => x.method === 'turn/interrupt')?.params, { threadId: 'thread-1', turnId: 'turn-1' });
  }
});

test('user cancellation and whole-turn timeout interrupt and remove listeners', async t => {
  for (const kind of ['cancel', 'timeout']) {
    const controller = new AbortController();
    const f = await session(() => { if (kind === 'cancel') controller.abort(); });
    t.after(() => f.client.close());
    await assert.rejects(readOnlyProbe(f.client, 'disposable-directory', { signal: controller.signal, timeoutMs: 15 }), {
      code: kind === 'cancel' ? 'CANCELLED' : 'TURN_TIMEOUT',
    });
    assert.equal(f.sent.filter(x => x.method === 'turn/interrupt').length, 1);
    assert.equal(f.client.listenerCount('notification'), 0);
  }
});

test('an already cancelled probe cannot start a thread or model turn', async t => {
  const f = await session(() => {}); t.after(() => f.client.close());
  await assert.rejects(readOnlyProbe(f.client, 'disposable-directory', { signal: AbortSignal.abort() }), { code: 'CANCELLED' });
  assert.equal(f.sent.length, 2);
});

test('cancellation verification requires acknowledgement and an interrupted terminal event', async t => {
  for (const status of ['interrupted', 'completed', null]) {
    const f = await session(() => {}, status); t.after(() => f.client.close());
    const probe = cancelReadOnlyProbe(f.client, 'disposable-directory', { interruptTimeoutMs: 20 });
    if (status === 'interrupted') {
      assert.deepEqual(await probe, { status: 'verified', check: 'read-only-turn-cancellation', interruptAcknowledged: true, interruptedObserved: true });
    } else await assert.rejects(probe, { code: 'CANCELLATION_NOT_CONFIRMED' });
    assert.equal(f.sent.filter(x => x.method === 'turn/start').length, 1);
    assert.equal(f.sent.filter(x => x.method === 'turn/interrupt').length, 1);
  }
});

test('structured model failures distinguish quota and auth; free-form prose never does', async t => {
  for (const [info, code] of [['unauthorized', 'AUTH_REQUIRED'], ['usageLimitExceeded', 'USAGE_LIMIT'],
    ['rateLimitExceeded', 'RATE_LIMITED'], ['sandboxError', 'SANDBOX_FAILED'], ['futureError', 'RPC_FAILED']] as const) {
    const f = await session(f => event(f, 'turn/completed', {
      turn: { id: 'turn-1', status: 'failed', error: { codexErrorInfo: info, message: 'private@example.test' } },
    }));
    t.after(() => f.client.close());
    await assert.rejects(readOnlyProbe(f.client, 'disposable-directory'), { code });
  }
  assert.equal(modelFailureCode({ httpConnectionFailed: { httpStatusCode: 401 } }), 'AUTH_REQUIRED');
  assert.equal(modelFailureCode({ responseStreamDisconnected: { httpStatusCode: 429 } }), 'RATE_LIMITED');
  assert.equal(modelFailureCode({ httpConnectionFailed: { httpStatusCode: 503 } }), 'CONNECTION_FAILED');
  assert.equal(modelFailureCode('unauthorized sk-private'), 'RPC_FAILED');
});

test('RPC structured errors are classified without retaining their payload', async t => {
  const f = fixture(); t.after(() => f.client.close()); await f.initialize();
  const request = f.client.request('thread/start', {});
  f.reply({ id: 2, error: { message: 'private', data: { codexErrorInfo: 'usageLimitExceeded', token: 'private' } } });
  await assert.rejects(request, { code: 'USAGE_LIMIT', message: 'Codex request failed: USAGE_LIMIT' });
});

test('retry notifications do not turn a later successful response into failure', async t => {
  const f = await session(f => {
    event(f, 'error', { willRetry: true, error: { codexErrorInfo: 'rateLimitExceeded', message: 'private' } });
    event(f, 'item/completed', { item: { type: 'agentMessage', text: PROBE_MARKER } });
    event(f, 'turn/completed', { turn: { id: 'turn-1', status: 'completed' } });
  }); t.after(() => f.client.close());
  const kinds: string[] = [];
  assert.equal((await readOnlyProbe(f.client, 'disposable-directory', { onProgress: kind => kinds.push(kind) })).markerMatched, true);
  assert.ok(kinds.includes('retrying'));
});

test('an abort settles a pending thread-start request without waiting for the RPC timeout', async t => {
  const f = fixture(); t.after(() => f.client.close()); await f.initialize();
  const controller = new AbortController();
  const probe = readOnlyProbe(f.client, 'disposable-directory', { signal: controller.signal });
  controller.abort();
  await assert.rejects(probe, { code: 'CANCELLED' });
  assert.equal(f.sent.filter(x => x.method === 'turn/start').length, 0);
});

test('another turn cannot supply the cancellation terminal event', async t => {
  const f = await session(() => {}, null); t.after(() => f.client.close());
  f.output.on('data', chunk => {
    const message = JSON.parse(String(chunk)) as Record<string, unknown>;
    if (message.method === 'turn/interrupt') event(f, 'turn/completed', { turnId: 'other-turn', turn: { id: 'other-turn', status: 'interrupted' } });
  });
  await assert.rejects(cancelReadOnlyProbe(f.client, 'disposable-directory', { interruptTimeoutMs: 20 }), { code: 'CANCELLATION_NOT_CONFIRMED' });
});

test('non-retrying auth notification keeps its reason even when interruption lacks terminal evidence', async t => {
  const f = await session(f => event(f, 'error', {
    willRetry: false, error: { codexErrorInfo: 'unauthorized', message: 'private@example.test' },
  }), null);
  t.after(() => f.client.close());
  await assert.rejects(readOnlyProbe(f.client, 'disposable-directory', { interruptTimeoutMs: 20 }), {
    code: 'AUTH_REQUIRED', message: 'Codex probe blocked: AUTH_REQUIRED',
  });
});

test('whole-turn timeout also bounds an unanswered thread-start request', async t => {
  const f = fixture(); t.after(() => f.client.close()); await f.initialize();
  await assert.rejects(readOnlyProbe(f.client, 'disposable-directory', { timeoutMs: 15 }), { code: 'TURN_TIMEOUT' });
  assert.equal(f.sent.filter(x => x.method === 'turn/start').length, 0);
});
