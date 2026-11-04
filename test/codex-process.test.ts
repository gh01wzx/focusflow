import test from 'node:test';
import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { withCodexProcess } from '../src/codex/process.ts';
import { cancelReadOnlyProbe, ProbeFailure } from '../src/codex/read-only-probe.ts';

const fixture = fileURLToPath(new URL(import.meta.url.endsWith('.ts')
  ? './fixtures/codex-server.ts' : './fixtures/codex-server.js', import.meta.url));
const environment: NodeJS.ProcessEnv = {};
for (const key of ['SystemRoot', 'WINDIR', 'TEMP', 'TMP']) {
  if (process.env[key]) environment[key] = process.env[key];
}

test('real child transport confirms interruption even if turn-start never returns', async () => {
  for (const mode of ['normal', 'pending-start']) {
    let directory = '';
    const result = await withCodexProcess(process.execPath, [fixture, mode], environment, async (client, cwd) => {
      directory = cwd;
      await client.initialize();
      return cancelReadOnlyProbe(client, cwd);
    });
    assert.equal(result.result.interruptedObserved, true);
    assert.equal(result.processClosed, true);
    assert.equal(result.temporaryDirectoryRemoved, true);
    await assert.rejects(access(directory), { code: 'ENOENT' });
  }
});

test('acknowledgement without terminal evidence fails and still cleans up the owned process', async () => {
  let directory = '';
  await assert.rejects(withCodexProcess(process.execPath, [fixture, 'ack-only'], environment, async (client, cwd) => {
    directory = cwd;
    await client.initialize();
    return cancelReadOnlyProbe(client, cwd, { interruptTimeoutMs: 30 });
  }), { code: 'CANCELLATION_NOT_CONFIRMED' });
  await assert.rejects(access(directory), { code: 'ENOENT' });
});

test('owned-process forced cleanup preserves the primary task failure', async () => {
  let directory = '';
  await assert.rejects(withCodexProcess(process.execPath, [fixture, 'stubborn'], environment, async (client, cwd) => {
    directory = cwd;
    await client.initialize();
    throw new ProbeFailure('USAGE_LIMIT');
  }, { graceMs: 30, shutdownMs: 5000 }), { code: 'USAGE_LIMIT' });
  await assert.rejects(access(directory), { code: 'ENOENT' });
});

test('spawn failure rejects pending initialization and removes the disposable cwd', async () => {
  let directory = '';
  await assert.rejects(withCodexProcess(fileURLToPath(new URL('./absent-codex-executable', import.meta.url)), [], environment, async (client, cwd) => {
    directory = cwd;
    await client.initialize();
  }), { code: 'CLOSED' });
  await assert.rejects(access(directory), { code: 'ENOENT' });
});
