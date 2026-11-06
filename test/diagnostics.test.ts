import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createConnection } from 'node:net';
import { listenLocal } from '../src/http/local-server.ts';
import { runDesktopOnce } from '../src/runtime/launch.ts';
import { exitExplanation, startupFailure, supportLine } from '../src/runtime/diagnostics.ts';
import { parseBuildInfo } from '../src/shared/build.ts';
import { MigrationError, NewerDatabaseError } from '../src/database/migrate.ts';

const build = { version: '0.1.0-alpha.3', commit: 'a'.repeat(40), schema: 5, dirty: false };

test('startup diagnostics distinguish data, window and native failures without exposing raw errors', () => {
  assert.match(startupFailure('opening-data', new NewerDatabaseError(), build), /newer app/);
  assert.match(startupFailure('opening-data', new MigrationError(new Error('private data'), undefined), build), /rolled back/);
  assert.match(startupFailure('loading-window', new Error('private data'), build), /window could not load/);
  assert.match(startupFailure('profile', new Error('private data'), build), /review name/);
  assert.equal(startupFailure('opening-data', new Error('private data'), build).includes('private data'), false);
  assert.match(exitExplanation(-2147483645, null, false), /0x80000003/);
  assert.match(exitExplanation(1, null, true), /application/);
  assert.match(supportLine({ ...build, dirty: true }), /local changes/);
  assert.deepEqual(parseBuildInfo(build), build);
  assert.throws(() => parseBuildInfo({ ...build, commit: 'private text' }));
});

test('launcher filters stage markers and makes one bounded attempt using disposable Node fixtures', async () => {
  const stages: string[] = [];
  const success = await runDesktopOnce(process.execPath, ['-e',
    "console.log('do not publish secret output'); console.log('FOCUSFLOW_STAGE:window-ready');"], {
    cwd: process.cwd(), timeoutMs: 5000, stage: stage => stages.push(stage),
  });
  assert.equal(success.ok, true);
  assert.deepEqual(stages, ['window-ready']);
  assert.equal(success.message.includes('secret output'), false);
  const failed = await runDesktopOnce(process.execPath, ['-e', "process.stderr.write('private stderr'); process.exit(3)"], {
    cwd: process.cwd(), timeoutMs: 5000, stage: () => assert.fail('No startup stage was emitted'),
  });
  assert.equal(failed.ok, false);
  assert.equal(failed.ready, false);
  assert.match(failed.message, /0x00000003/);
  assert.equal(failed.message.includes('private stderr'), false);
  const timeout = await runDesktopOnce(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
    cwd: process.cwd(), timeoutMs: 300, stage: () => {},
  });
  assert.equal(timeout.ok, false);
  assert.match(timeout.message, /timed out/);
});

test('server close retires a connected socket that never sent an HTTP request', async () => {
  let disposed = 0;
  const stages: string[] = [];
  const server = await listenLocal(async (_request, response) => { response.end(); }, () => { disposed++; }, stage => stages.push(stage));
  const url = new URL(server.origin);
  const socket = createConnection({ host: url.hostname, port: Number(url.port) });
  socket.on('error', () => {});
  await once(socket, 'connect');
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([server.close(), new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('Unparsed socket prevented closure.')), 2000);
    })]);
    await server.close();
    assert.equal(disposed, 1);
    assert.deepEqual(stages, ['draining-requests', 'connections-closed', 'store-closed']);
  } finally { if (timer) clearTimeout(timer); socket.destroy(); await server.close(); }
});

test('server close drains active handlers before disposing data and is idempotent', async () => {
  let enter!: () => void;
  const entered = new Promise<void>(resolve => { enter = resolve; });
  let release!: () => void;
  const released = new Promise<void>(resolve => { release = resolve; });
  let finished = false;
  let disposed = false;
  const server = await listenLocal(async (_request, response) => {
    enter(); await released; finished = true; response.end('done');
  }, () => { assert.equal(finished, true); disposed = true; });
  const request = fetch(server.origin).catch(() => undefined);
  await entered;
  const close = server.close();
  assert.equal(disposed, false);
  release();
  await close; await request;
  await server.close();
  assert.equal(disposed, true);
});
