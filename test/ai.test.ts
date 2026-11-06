import test from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CodexClient, CodexFailure } from '../src/codex/client.ts';
import { ProbeFailure } from '../src/codex/read-only-probe.ts';
import { createAiService } from '../src/ai/service.ts';
import type { AiRuntime } from '../src/ai/service.ts';
import { parseAiStatus, isAiSignInUrl } from '../src/shared/ai.ts';
import { startWorkspaceServer } from '../src/workspace/server.ts';
import { createAiClient } from '../src/client/ai.ts';

function fakeRuntime(options: { installed?: boolean; auth?: string; earlyLogin?: boolean; badUrl?: boolean } = {}) {
  const methods: string[] = [];
  let notify: (method: string, params: unknown) => void = () => {};
  const runtime: AiRuntime = {
    installed: async () => options.installed !== false,
    async run(operation) {
      const input = new PassThrough();
      const output = new PassThrough();
      const client = new CodexClient(input, output, 1000);
      notify = (method, params) => { input.write(JSON.stringify({ method, params }) + '\n'); };
      output.on('data', (chunk: Buffer) => {
        for (const line of chunk.toString().trim().split('\n')) {
          const request = JSON.parse(line) as { id?: number; method: string };
          if (request.id === undefined) continue;
          methods.push(request.method);
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
