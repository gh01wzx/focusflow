import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { awaitInterfaceReady, StartupFailure } from '../src/runtime/startup.ts';
import { diagnoseRuntime, diagnoseDesktopRuntime, RUNTIME_MARKER } from '../src/runtime/diagnostic.ts';
import { startWorkspaceServer } from '../src/workspace/server.ts';
import { readBuild, reportInterfaceReady } from '../src/client/build.ts';
import { parseBuildInfo } from '../src/shared/build.ts';

test('native window load alone is not interface readiness; missing content has a bounded failure', async () => {
  await assert.rejects(awaitInterfaceReady(async () => {}, new Promise<void>(() => {}), 15), error => error instanceof StartupFailure && error.code === 'INTERFACE_NOT_READY');
  await assert.rejects(awaitInterfaceReady(async () => { throw new Error('private path'); }, Promise.resolve(), 100), error => error instanceof StartupFailure && error.code === 'WINDOW_LOAD_FAILED');
  await assert.rejects(awaitInterfaceReady(() => { throw new Error('synchronous window failure'); }, Promise.resolve(), 100), error => error instanceof StartupFailure && error.code === 'WINDOW_LOAD_FAILED');
  let ready!: () => void; const signal = new Promise<void>(resolve => { ready = resolve; });
  let loaded = false; const result = awaitInterfaceReady(async () => { loaded = true; }, signal, 500);
  await Promise.resolve(); assert.equal(loaded, true); ready(); await result;
});

test('runtime diagnostic owns one bounded attempt and returns no raw output', async () => {
  assert.equal((await diagnoseRuntime(process.execPath, ['-e', 'console.log(' + JSON.stringify(RUNTIME_MARKER) + ')'])).status, 'verified');
  const absent = await diagnoseRuntime(join(tmpdir(), 'focusflow-missing-runtime-' + Date.now()), []);
  assert.equal(absent.reason, 'MISSING_RUNTIME');
  const failed = await diagnoseRuntime(process.execPath, ['-e', 'console.log("private task and token"); process.exit(7)']);
  assert.equal(failed.reason, 'NATIVE_RUNTIME_EXIT'); assert.equal(failed.exitCode, '0x00000007'); assert.doesNotMatch(JSON.stringify(failed), /private|token/);
  const silent = await diagnoseRuntime(process.execPath, ['-e', 'process.exit(0)']); assert.equal(silent.reason, 'READY_SIGNAL_MISSING');
  const start = Date.now(); const timeout = await diagnoseRuntime(process.execPath, ['-e', 'setInterval(()=>{}, 1000)'], 30);
  assert.equal(timeout.reason, 'RUNTIME_TIMEOUT'); assert.ok(Date.now() - start < 2000);
});

test('data-free diagnostic fails if a runtime touches its disposable guard profile', async () => {
  const clean = await diagnoseDesktopRuntime(process.execPath, ['-e', 'console.log(' + JSON.stringify(RUNTIME_MARKER) + ')']);
  assert.equal(clean.status, 'verified'); assert.equal(clean.taskDataOpened, false); assert.equal(clean.attempts, 1);
  const touched = await diagnoseDesktopRuntime(process.execPath, ['-e', 'require("node:fs").mkdirSync(process.env.FOCUSFLOW_TEST_PROFILE); console.log(' + JSON.stringify(RUNTIME_MARKER) + ')']);
  assert.equal(touched.status, 'failed'); assert.equal(touched.taskDataOpened, true); assert.equal(touched.reason, 'DIAGNOSTIC_OPENED_TASK_PROFILE');
});

test('Build information excludes local paths/data; readiness is explicit same-origin and idempotent', async t => {
  const root = await mkdtemp(join(tmpdir(), 'focusflow-build-info-')); let signals = 0;
  const server = await startWorkspaceServer({ dataDirectory: root, sampleLabel: 'Test', appVersion: '1.2.3-test.4', onInterfaceReady: () => { signals++; } });
  t.after(async () => { await server.close(); await rm(root, { recursive: true, force: true }); });
  const transport: typeof fetch = (path, options) => fetch(server.origin + String(path), { ...options, headers: { ...options?.headers, Origin: server.origin } });
  const info = await readBuild(transport); assert.equal(info.version, '1.2.3-test.4'); assert.equal(info.profile, 'sample'); assert.deepEqual(parseBuildInfo(info), info);
  assert.doesNotMatch(JSON.stringify(info), /tracker.db|LOCALAPPDATA|credential|FocusFlow.*Temp/i); assert.equal(signals, 0);
  assert.equal((await fetch(server.origin + '/api/runtime/ready', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"ready":true}' })).status, 403);
  assert.equal(signals, 0); await reportInterfaceReady(transport); await reportInterfaceReady(transport); assert.equal(signals, 1);
  await assert.rejects(readBuild(async () => Response.json({ ...info, commit: 'private-path' })), /unavailable/);
});
