import test from 'node:test';
import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startServer } from '../src/server.ts';
import { request as httpRequest } from 'node:http';

async function fixture(t: TestContext) {
  const dataDirectory = await mkdtemp(join(tmpdir(), 'focusflow-http-test-'));
  let app = await startServer({ dataDirectory });
  t.after(async () => { await app.close(); await rm(dataDirectory, { recursive: true, force: true }); });
  return { get app() { return app; }, async restart() { await app.close(); app = await startServer({ dataDirectory }); } };
}

const post = (origin: string, path: string, value: unknown, extraHeaders: Record<string, string> = {}) => fetch(origin + path, {
  method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', ...extraHeaders }, body: JSON.stringify(value),
});

async function readNote(origin: string): Promise<string> {
  const response = await fetch(origin + '/api/probe');
  assert.equal(response.status, 200);
  const payload: unknown = await response.json();
  assert.ok(typeof payload === 'object' && payload !== null && 'note' in payload);
  assert.ok(typeof payload.note === 'string');
  return payload.note;
}

test('HTTP save, server restart, read and backup use the real SQLite store', async t => {
  const f = await fixture(t);
  assert.equal((await fetch(f.app.origin)).status, 200);
  assert.equal((await post(f.app.origin, '/api/probe', { note: '\u670d\u52a1\u5668\u91cd\u542f\u9a8c\u8bc1' })).status, 200);
  await f.restart();
  assert.equal(await readNote(f.app.origin), '\u670d\u52a1\u5668\u91cd\u542f\u9a8c\u8bc1');
  assert.equal((await post(f.app.origin, '/api/backup', {})).status, 201);
});

test('cross-origin writes, DNS rebinding hosts and oversized payloads are refused', async t => {
  const { app } = await fixture(t);
  assert.equal((await post(app.origin, '/api/probe', { note: 'x' }, { Origin: 'https://other.example' })).status, 403);
  const reboundStatus = await new Promise<number | undefined>((resolve, reject) => {
    const request = httpRequest(app.origin, { headers: { Host: 'other.example' } }, response => {
      response.resume();
      resolve(response.statusCode);
    });
    request.on('error', reject);
    request.end();
  });
  assert.equal(reboundStatus, 403);
  assert.equal((await post(app.origin, '/api/probe', { note: 'x'.repeat(5000) })).status, 413);
  assert.equal(await readNote(app.origin), '');
});
