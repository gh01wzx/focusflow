import test from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CodexClient, CodexFailure } from '../src/codex/client.ts';
import { ProbeFailure } from '../src/codex/read-only-probe.ts';
import { createAiService } from '../src/ai/service.ts';
import { createAiRuntime } from '../src/ai/runtime.ts';
import { resolveCodexCommand } from '../src/codex/runtime.ts';
import type { AiRuntime } from '../src/ai/service.ts';
import { CODEX_VERSION, parseAiStatus, isAiSignInUrl } from '../src/shared/ai.ts';

test('closing interrupts an account request before the normal protocol timeout', async () => {
  let entered!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; });
  const runtime: AiRuntime = {
    installed: async () => true,
    async run(operation) {
      const input = new PassThrough(); const output = new PassThrough();
      const client = new CodexClient(input, output, 5000);
      output.on('data', () => { entered(); });
      try { return await operation(client, tmpdir()); }
      finally { client.close(); input.destroy(); output.destroy(); }
    },
  };
  const service = createAiService(runtime);
  const check = service.check(); await started;
  const before = Date.now(); await service.close(); await check;
  assert.ok(Date.now() - before < 1000);
  assert.equal(service.status().verified, false);
});

test('shutdown during runtime discovery does not start another owned process', async () => {
  let release!: (value: boolean) => void;
  const installed = new Promise<boolean>(resolve => { release = resolve; });
  let runs = 0;
  const service = createAiService({ installed: () => installed, run: async () => { runs++; throw new Error('Must not start'); } });
  const checking = service.check();
  const closing = service.close(); release(true);
  await closing; await checking;
  assert.equal(runs, 0);
});

test('a probe completing during shutdown cannot report verified success', async () => {
  let entered!: () => void;
  const running = new Promise<void>(resolve => { entered = resolve; });
  const service = createAiService(fakeRuntime().runtime, async (_client, _cwd, options) => {
    entered();
    await new Promise<void>(resolve => options?.signal?.addEventListener('abort', () => resolve(), { once: true }));
    return { status: 'verified', check: 'read-only-model-turn', deltaEvents: 1, markerMatched: true };
  });
  const result = service.verify(true); await running;
  await service.close();
  assert.equal((await result).verified, false);
});

test('separate app profiles pass separate credential homes to the shared pinned runtime', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'focusflow-ai-profile-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const cli = join(directory, 'FocusFlow', 'codex-product', 'runtime', 'node_modules', '@openai', 'codex');
  await mkdir(join(cli, 'bin'), { recursive: true });
  await writeFile(join(cli, 'package.json'), JSON.stringify({ version: CODEX_VERSION, type: 'module' }));
  await writeFile(join(cli, 'bin', 'codex.js'), [
    "process.stdin.setEncoding('utf8'); let buffer = '';",
    "process.stdin.on('data', chunk => { buffer += chunk; let i;",
    "while ((i = buffer.indexOf('\\n')) >= 0) { const message = JSON.parse(buffer.slice(0, i)); buffer = buffer.slice(i + 1);",
    "if (message.id !== undefined) process.stdout.write(JSON.stringify({ id: message.id, result: message.method === 'fixture/home' ? { home: process.env.CODEX_HOME } : {} }) + '\\n'); }});",
  ].join('\n'));
  for (const name of ['everyday', 'review']) {
    const selected = join(directory, name);
    const runtime = createAiRuntime(directory, false, selected, path => resolveCodexCommand(path, 'linux'));
    assert.equal(await runtime.installed(), true);
    await runtime.run(async client => {
      await client.initialize();
      assert.deepEqual(await client.request('fixture/home', {}), { home: join(selected, 'codex-profile') });
      return { mode: 'unchecked', runtimeVersion: CODEX_VERSION, account: null, plan: null, signInUrl: null, verified: false, message: 'Fixture only' };
    });
  }
});
import { startWorkspaceServer } from '../src/workspace/server.ts';
import { createAiClient } from '../src/client/ai.ts';

function fakeRuntime(options: { installed?: boolean; auth?: string; earlyLogin?: boolean; badUrl?: boolean; stalledCancel?: boolean } = {}) {
  const methods: string[] = [];
  let notify: (method: string, params: unknown) => void = () => {};
  const runtime: AiRuntime = {
    installed: async () => options.installed !== false,
    async run(operation) {
      const input = new PassThrough();
      const output = new PassThrough();
      const client = new CodexClient(input, output, options.stalledCancel ? 5000 : 1000);
      notify = (method, params) => { input.write(JSON.stringify({ method, params }) + '\n'); };
      output.on('data', (chunk: Buffer) => {
        for (const line of chunk.toString().trim().split('\n')) {
          const request = JSON.parse(line) as { id?: number; method: string };
          if (request.id === undefined) continue;
          methods.push(request.method);
          if (options.stalledCancel && request.method === 'account/login/cancel') continue;
          let result: unknown = {};
          if (request.method === 'account/read') result = { account: options.auth === 'none' ? null : {
            type: options.auth ?? 'chatgpt', email: 'test@example.invalid', planType: 'plus', accessToken: 'never-expose-this',
          } };
          if (request.method === 'account/login/start') {
            if (options.earlyLogin) notify('account/login/completed', { loginId: 'one', success: true });
            result = { loginId: 'one', authUrl: options.badUrl ? 'https://untrusted.invalid/?secret=never-expose-this' : 'https://auth.openai.com/oauth/authorize?state=test' };
          }
          input.write(JSON.stringify({ id: request.id, result }) + '\n');
        }
      });
      try { return await operation(client, tmpdir()); }
      finally { client.close(); input.destroy(); output.destroy(); }
    },
  };
  return { runtime, methods, notify: (method: string, params: unknown) => notify(method, params) };
}

test('AI checks are explicit, strip provider secrets and never fall back to API billing', async () => {
  let probes = 0;
  const probe = async () => { probes++; return { status: 'verified' as const, check: 'read-only-model-turn' as const, deltaEvents: 1, markerMatched: true as const }; };
  const fake = fakeRuntime();
  const service = createAiService(fake.runtime, probe);
  try {
    assert.equal(service.status().mode, 'unchecked');
    assert.equal(fake.methods.length, 0);
    await service.verify(false);
    assert.equal(fake.methods.length, 0);
    const account = await service.check();
    assert.equal(account.mode, 'chatgpt');
    assert.equal(account.verified, false);
    assert.equal(JSON.stringify(account).includes('never-expose-this'), false);
    assert.equal(probes, 0);
    assert.equal((await service.verify(true)).verified, true);
    assert.equal(probes, 1);
    for (const auth of ['apiKey', 'amazonBedrock', 'none']) {
      const unsupported = createAiService(fakeRuntime({ auth }).runtime, probe);
      try { assert.equal((await unsupported.verify(true)).verified, false); }
      finally { await unsupported.close(); }
    }
    assert.equal(probes, 1);
    assert.equal(fake.methods.some(method => method.startsWith('turn/')), false, 'This test injects a probe and never calls a model.');
  } finally { await service.close(); }
});

test('missing runtime and simulated structured failures produce readable bounded results', async () => {
  const missing = fakeRuntime({ installed: false });
  const service = createAiService(missing.runtime);
  assert.equal((await service.check()).mode, 'missing');
  assert.equal((await service.signIn()).mode, 'missing');
  assert.equal(missing.methods.length, 0);
  await service.close();
  for (const [error, message] of [[new CodexFailure('AUTH_REQUIRED'), /Sign in/],
    [new ProbeFailure('USAGE_LIMIT'), /allowance is exhausted/], [new CodexFailure('RATE_LIMITED'), /rate limited/],
    [new CodexFailure('TIMEOUT'), /did not respond in time/],
    [new Error('secret-provider-payload'), /runtime could not/]] as const) {
    const failed = createAiService(fakeRuntime().runtime, async () => { throw error; });
    try {
      const state = await failed.verify(true);
      assert.match(state.message, message);
      assert.equal(state.verified, false);
      assert.equal(JSON.stringify(state).includes('secret-provider-payload'), false);
    } finally { await failed.close(); }
  }
});

test('sign-in cancellation releases a stalled provider and allows a fresh account check', async () => {
  const fake = fakeRuntime({ stalledCancel: true });
  const service = createAiService(fake.runtime);
  try {
    assert.equal((await service.signIn()).mode, 'signing-in');
    const started = Date.now();
    const cancelled = await service.cancel();
    assert.ok(Date.now() - started < 1000, 'Cancellation must not wait for the five-second provider timeout.');
    assert.equal(cancelled.mode, 'signed-out');
    assert.equal(cancelled.signInUrl, null);
    assert.equal(cancelled.verified, false);
    assert.equal(fake.methods.filter(method => method === 'account/login/cancel').length, 1);
    fake.notify('account/login/completed', { loginId: 'one', success: true });
    assert.equal(service.status().mode, 'signed-out');
    assert.equal((await service.check()).mode, 'chatgpt');
    assert.equal(fake.methods.some(method => method.startsWith('turn/')), false);
  } finally { await service.close(); }
});

test('managed sign-in handles early completion, cancellation and untrusted URLs without leaking responses', async () => {
  const early = createAiService(fakeRuntime({ earlyLogin: true }).runtime);
  await early.signIn(); await early.close();
  assert.equal(early.status().mode, 'chatgpt');
  const pending = fakeRuntime();
  const service = createAiService(pending.runtime);
  assert.equal((await service.signIn()).mode, 'signing-in');
  pending.notify('account/login/completed', { loginId: 'unrelated', success: true });
  assert.equal(service.status().mode, 'signing-in');
  assert.equal((await service.cancel()).mode, 'signed-out');
  assert.equal(pending.methods.includes('account/login/cancel'), true);
  await service.close();
  const bad = createAiService(fakeRuntime({ badUrl: true }).runtime);
  try {
    assert.equal((await bad.signIn()).mode, 'error');
    assert.equal(JSON.stringify(bad.status()).includes('never-expose-this'), false);
  } finally { await bad.close(); }
  for (const url of ['http://auth.openai.com/', 'https://auth.openai.com.evil.invalid/', 'https://user:secret@chatgpt.com/', 'https://chatgpt.com:444/']) {
    assert.equal(isAiSignInUrl(url), false);
  }
  assert.throws(() => parseAiStatus({}));
});

test('AI HTTP checks keep model usage opt-in and enforce the loopback write boundary', async () => {
  const root = await mkdtemp(join(tmpdir(), 'focusflow-ai-http-'));
  const fake = fakeRuntime({ installed: false });
  const server = await startWorkspaceServer({ dataDirectory: root, ai: createAiService(fake.runtime) });
  try {
    const client = createAiClient((path, options) => fetch(server.origin + String(path), {
      ...options, headers: { ...options?.headers, Origin: server.origin },
    }));
    assert.equal((await client.status()).mode, 'unchecked');
    assert.equal((await client.verify(false)).verified, false);
    assert.equal((await client.check()).mode, 'missing');
    assert.equal(fake.methods.length, 0);
    assert.equal((await fetch(server.origin + '/api/ai/verify', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"confirmAllowance":true}',
    })).status, 403);
  } finally { await server.close(); await rm(root, { recursive: true, force: true }); }
});

test('closing the service aborts an owned probe and waits for its cleanup', async () => {
  let started!: () => void;
  const running = new Promise<void>(resolve => { started = resolve; });
  let aborted = false;
  const service = createAiService(fakeRuntime().runtime, async (_client, _cwd, options) => {
    started();
    await new Promise<void>(resolve => options?.signal?.addEventListener('abort', () => {
      aborted = true; resolve();
    }, { once: true }));
    throw new ProbeFailure('CANCELLED');
  });
  const result = service.verify(true);
  await running;
  await service.close();
  assert.equal(aborted, true);
  assert.equal((await result).verified, false);
});
