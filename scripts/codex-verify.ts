// Explicit developer commands only. Ordinary tests never execute this file.
import { spawn } from 'node:child_process';
import { mkdir, readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, dirname, basename, isAbsolute } from 'node:path';
import { once } from 'node:events';
import { CodexFailure, record } from '../src/codex/client.ts';
import { readOnlyProbe, cancelReadOnlyProbe, ProbeFailure } from '../src/codex/read-only-probe.ts';
import { withCodexProcess, CodexProcessFailure } from '../src/codex/process.ts';
import { CODEX_VERSION } from '../src/shared/ai.ts';

const VERSION = CODEX_VERSION;
const mode = process.argv[2];
const product = process.argv.includes('--product');
if (!['install', 'login', 'status', 'live', 'cancel'].includes(mode ?? '') ||
    ((mode === 'live' || mode === 'cancel') && process.argv[3] !== '--live')) {
  console.error('Usage: npm run codex:install | codex:login | codex:status | codex:probe -- --live | codex:cancel -- --live');
  process.exit(2);
}

const root = join(process.platform === 'win32'
  ? (process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'))
  : join(homedir(), '.local', 'share'), 'FocusFlow', product ? 'codex-product' : 'codex-phase0');
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
const config = ['-c', product ? 'cli_auth_credentials_store="keyring"' : 'cli_auth_credentials_store="file"'];
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
    console.log(`Official Codex CLI ${VERSION} installed for ${product ? 'FocusFlow AI' : 'the Phase 0 probe'}.`);
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

  const controller = new AbortController();
  const cancel = () => controller.abort();
  process.on('SIGINT', cancel);
  try {
    const lifecycle = await withCodexProcess(process.execPath,
      [cli, ...config, 'app-server', '--listen', 'stdio://'], environment, async (client, cwd) => {
        await client.initialize();
        const account = record(record(await client.request('account/read', { refreshToken: false })).account);
        const auth = account.type === 'chatgpt' ? 'chatgpt' : account.type === 'apiKey' ? 'apiKey' : 'none';
        const accountStatus = { check: 'account-status', cliVersion: VERSION, auth };
        if (mode === 'status') return accountStatus;
        console.log(JSON.stringify(accountStatus));
        if (auth !== 'chatgpt') throw new ProbeFailure('CHATGPT_LOGIN_REQUIRED');
        console.log(mode === 'cancel'
          ? 'Starting one read-only turn and requesting immediate cancellation. This uses your Codex allowance.'
          : 'Starting one read-only model turn. This uses your Codex allowance. Ctrl+C cancels.');
        let lastKind = '';
        const probe = mode === 'cancel' ? cancelReadOnlyProbe : readOnlyProbe;
        return probe(client, cwd, { signal: controller.signal, onProgress: kind => {
          if (lastKind !== kind) console.log(`Progress: ${kind}`);
          lastKind = kind;
        } });
      });
    // Verified output is emitted only after owned-process closure and temp cleanup succeed.
    console.log(JSON.stringify({ ...lifecycle.result, cliVersion: VERSION,
      processClosed: lifecycle.processClosed, temporaryDirectoryRemoved: lifecycle.temporaryDirectoryRemoved }));
  } finally {
    process.off('SIGINT', cancel);
  }
}

try { await verify(); }
catch (error) {
  const reason = error instanceof CodexFailure || error instanceof ProbeFailure || error instanceof CodexProcessFailure
    ? error.code : 'LOCAL_COMMAND_FAILED';
  console.error(JSON.stringify({ status: 'blocked', reason,
    ...(error instanceof CodexProcessFailure && error.cleanupFailed ? { cleanupFailed: true } : {}) }));
  process.exitCode = 1;
}
