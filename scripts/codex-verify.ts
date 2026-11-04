// Explicit developer commands only. Ordinary tests never execute this file.
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir, homedir } from 'node:os';
import { join, resolve, dirname, basename, isAbsolute } from 'node:path';
import { once } from 'node:events';
import { CodexClient, CodexFailure, record } from '../src/codex/client.ts';
import { readOnlyProbe, ProbeFailure } from '../src/codex/read-only-probe.ts';

const VERSION = '0.166.0';
const mode = process.argv[2];
if (!['install', 'login', 'status', 'live'].includes(mode ?? '') ||
    (mode === 'live' && process.argv[3] !== '--live')) {
  console.error('Usage: npm run codex:install | codex:login | codex:status | codex:probe -- --live');
  process.exit(2);
}

const root = join(process.platform === 'win32'
  ? (process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'))
  : join(homedir(), '.local', 'share'), 'FocusFlow', 'codex-phase0');
const profile = join(root, 'profile');
const runtime = join(root, 'runtime');
const cli = join(runtime, 'node_modules', '@openai', 'codex', 'bin', 'codex.js');
const environment: NodeJS.ProcessEnv = {};
for (const key of ['PATH', 'Path', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'USERPROFILE', 'HOME', 'HOMEDRIVE', 'HOMEPATH', 'LOCALAPPDATA', 'APPDATA']) {
  const value = process.env[key];
  if (value) environment[key] = value;
}
// Dedicated CLI-owned authentication files; never read or copy the desktop App's credentials.
environment.CODEX_HOME = profile;
const config = ['-c', 'cli_auth_credentials_store="file"'];
await mkdir(profile, { recursive: true, mode: 0o700 });

async function interactive(script: string, args: string[], cwd: string): Promise<void> {
  const child = spawn(process.execPath, [script, ...args], { cwd, env: environment, stdio: 'inherit', windowsHide: true });
  const [code] = await once(child, 'exit');
  if (code !== 0) throw new ProbeFailure('COMMAND_FAILED');
}

async function verify(): Promise<void> {
  if (mode === 'install') {
    const npm = process.env.npm_execpath;
    if (!npm || !isAbsolute(npm) || basename(npm) !== 'npm-cli.js') throw new ProbeFailure('RUN_WITH_NPM');
    // Separate runtime avoids making the desktop installer depend on the development CLI.
    await interactive(npm, ['install', '--prefix', runtime, '--no-save', '--package-lock=false',
      '--ignore-scripts', '--no-audit', '--no-fund', `@openai/codex@${VERSION}`], root);
    console.log(`Official Codex CLI ${VERSION} installed for the Phase 0 probe.`);
    return;
  }
  let installed: unknown;
  try { installed = JSON.parse(await readFile(join(dirname(dirname(cli)), 'package.json'), 'utf8')); }
  catch { throw new ProbeFailure('CLI_MISSING_RUN_CODEX_INSTALL'); }
  if (record(installed).version !== VERSION) throw new ProbeFailure('CLI_VERSION_MISMATCH');
  if (mode === 'login') {
    await interactive(cli, [...config, 'login'], profile);
    return;
  }

  const cwd = await mkdtemp(join(tmpdir(), 'focusflow-codex-turn-'));
  const child = spawn(process.execPath, [cli, ...config, 'app-server', '--listen', 'stdio://'], {
    cwd, env: environment, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true,
  });
  child.stderr.resume(); // Raw host diagnostics can contain account details or configuration paths.
  const client = new CodexClient(child.stdout, child.stdin);
  child.on('error', () => client.close());
  const controller = new AbortController();
  const cancel = () => controller.abort();
  process.on('SIGINT', cancel);
  let exited = false;
  child.once('exit', () => { exited = true; client.close(); });
  // Attach before cleanup; only this owned process tree may be terminated.
  const closed = new Promise<void>(resolveClosed => child.once('close', () => resolveClosed()));
  try {
    await client.initialize();
    const account = record(record(await client.request('account/read', { refreshToken: false })).account);
    const auth = account.type === 'chatgpt' ? 'chatgpt' : account.type === 'apiKey' ? 'apiKey' : 'none';
    console.log(JSON.stringify({ check: 'account-status', cliVersion: VERSION, auth }));
    if (mode === 'status') return;
    if (auth !== 'chatgpt') throw new ProbeFailure('CHATGPT_LOGIN_REQUIRED');
    console.log('Starting one read-only model turn. This uses your Codex allowance. Ctrl+C cancels.');
    let lastKind = '';
    const evidence = await readOnlyProbe(client, cwd, { signal: controller.signal, onProgress: kind => {
      if (lastKind !== kind) console.log(`Progress: ${kind}`);
      lastKind = kind;
    } });
    console.log(JSON.stringify({ ...evidence, cliVersion: VERSION }));
  } finally {
    process.off('SIGINT', cancel);
    client.close();
    child.stdin.end();
    let killTimer: ReturnType<typeof setTimeout> | undefined;
    let deadline: ReturnType<typeof setTimeout> | undefined;
    try {
      killTimer = setTimeout(() => {
        if (!exited && child.pid) {
          if (process.platform === 'win32') {
            const killer = spawn(join(environment.SystemRoot ?? 'C:\\Windows', 'System32', 'taskkill.exe'),
              ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
            killer.on('error', () => child.kill());
          } else child.kill('SIGKILL');
        }
      }, 2000);
      await Promise.race([closed, new Promise<never>((_, reject) => {
        deadline = setTimeout(() => reject(new ProbeFailure('PROCESS_CLEANUP_FAILED')), 10_000);
      })]);
    } finally {
      if (killTimer) clearTimeout(killTimer);
      if (deadline) clearTimeout(deadline);
    }
    if (dirname(resolve(cwd)) !== resolve(tmpdir()) || !basename(cwd).startsWith('focusflow-codex-turn-')) {
      throw new ProbeFailure('CLEANUP_PATH_REJECTED');
    }
    await rm(cwd, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
}

try { await verify(); }
catch (error) {
  const reason = error instanceof CodexFailure || error instanceof ProbeFailure ? error.code : 'LOCAL_COMMAND_FAILED';
  console.error(JSON.stringify({ status: 'blocked', reason }));
  process.exitCode = 1;
}
