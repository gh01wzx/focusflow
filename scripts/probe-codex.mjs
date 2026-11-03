// No model invocation, account login, token reading or access to existing sessions.
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, isAbsolute, resolve, dirname, basename } from 'node:path';
import { createInterface } from 'node:readline';

const executable = process.argv[2];
if (!executable || !isAbsolute(executable)) {
  console.error('Usage: node scripts/probe-codex.mjs <absolute-path-to-codex.exe>');
  process.exit(2);
}
const isolatedHome = await mkdtemp(join(tmpdir(), 'focusflow-codex-probe-'));
const childEnv = {};
for (const key of ['PATH', 'Path', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH', 'LOCALAPPDATA', 'APPDATA']) {
  if (process.env[key]) childEnv[key] = process.env[key];
}
childEnv.CODEX_HOME = isolatedHome;
const child = spawn(executable, ['app-server', '--listen', 'stdio://'], {
  cwd: isolatedHome, env: childEnv, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
});
// Deliberately discard stderr: it may contain host configuration details.
child.stderr.resume();
const lines = createInterface({ input: child.stdout });
let handshake = false;
let failure = false;
const result = await new Promise(resolve => {
  const timeout = setTimeout(() => { failure = true; child.kill(); }, 15000);
  child.once('error', error => { clearTimeout(timeout); failure = true; resolve({ status: 'blocked', reason: error.code || 'SPAWN_FAILED' }); });
  child.stdin.on('error', () => { failure = true; child.kill(); });
  lines.on('line', line => {
    let message;
    try { message = JSON.parse(line); } catch { return; }
    if (message.id !== 1) return;
    if (message.error) { failure = true; child.kill(); return; }
    if (message.result) {
      handshake = true;
      child.stdin.end(JSON.stringify({ method: 'initialized', params: {} }) + '\n');
      // We only need the transport handshake, not a persistent service.
      child.kill();
    }
  });
  child.once('close', () => {
    clearTimeout(timeout);
    resolve({ status: handshake && !failure ? 'verified' : 'blocked', check: 'isolated-stdio-initialize', modelTurnStarted: false, accountAccessed: false });
  });
  child.stdin.write(JSON.stringify({ id: 1, method: 'initialize', params: {
    clientInfo: { name: 'focusflow_phase0', version: '0.0.1' }, capabilities: { experimentalApi: false },
  } }) + '\n');
});
lines.close();
if (dirname(resolve(isolatedHome)) !== resolve(tmpdir()) || !basename(isolatedHome).startsWith('focusflow-codex-probe-')) {
  throw new Error('Refusing cleanup outside the isolated temporary probe directory');
}
try { await rm(isolatedHome, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); }
catch { console.error('Temporary isolated probe directory could not be removed.'); }
console.log(JSON.stringify(result, null, 2));
if (result.status !== 'verified') process.exitCode = 1;
