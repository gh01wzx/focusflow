import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { CodexClient, CodexFailure } from './client.ts';
import { ProbeFailure } from './read-only-probe.ts';

export class CodexProcessFailure extends Error {
  readonly code: string;
  readonly cleanupFailed: boolean;
  constructor(code: string, cleanupFailed = false) {
    super(`Codex process failed: ${code}`);
    this.code = code;
    this.cleanupFailed = cleanupFailed;
  }
}

export interface CodexProcessObservation {
  processClosed: true;
  temporaryDirectoryRemoved: true;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  spawnError: 'ENOENT' | 'EACCES' | 'EPERM' | 'OTHER' | null;
}

/** Owns one process and one disposable cwd. It never discovers existing App processes. */
export async function withCodexProcess<T>(
  executable: string, args: string[], environment: NodeJS.ProcessEnv,
  operation: (client: CodexClient, cwd: string) => Promise<T>,
  options: { graceMs?: number; shutdownMs?: number; onClosed?: (observation: CodexProcessObservation) => void } = {},
): Promise<{ result: T; processClosed: true; temporaryDirectoryRemoved: true }> {
  const cwd = await mkdtemp(join(tmpdir(), 'focusflow-codex-turn-'));
  const child = spawn(executable, args, { cwd, env: environment, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
  child.stderr.resume();
  const client = new CodexClient(child.stdout, child.stdin, 15_000, 1_048_576, child.pid ?? null);
  let spawnError: CodexProcessObservation['spawnError'] = null;
  child.on('error', (error: NodeJS.ErrnoException) => {
    spawnError = error.code === 'ENOENT' || error.code === 'EACCES' || error.code === 'EPERM' ? error.code : 'OTHER';
    client.close();
  });
  let exited = false;
  child.once('exit', () => { exited = true; });
  let exitCode: number | null = null;
  let signal: NodeJS.Signals | null = null;
  const closed = new Promise<void>(resolveClosed => child.once('close', (code, terminated) => {
    exitCode = code; signal = terminated; resolveClosed();
  }));
  let result!: T;
  let failed = false;
  let failure: unknown;
  try { result = await operation(client, cwd); }
  catch (error) { failed = true; failure = error; }
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
          killer.on('error', () => child.kill('SIGKILL'));
          killer.once('exit', code => { if (code !== 0 && !exited) child.kill('SIGKILL'); });
        } else child.kill('SIGKILL');
      }
    }, options.graceMs ?? 2000);
    await Promise.race([closed, new Promise<never>((_, reject) => {
      deadline = setTimeout(() => reject(new CodexProcessFailure('PROCESS_CLEANUP_FAILED')), options.shutdownMs ?? 10_000);
    })]);
    if (dirname(resolve(cwd)) !== resolve(tmpdir()) || !basename(cwd).startsWith('focusflow-codex-turn-')) {
      throw new CodexProcessFailure('CLEANUP_PATH_REJECTED');
    }
    await rm(cwd, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  } catch {
    // Preserve a known task failure when cleanup also fails; never expose raw host errors.
    const code = failure instanceof CodexFailure || failure instanceof ProbeFailure ? failure.code
      : failed ? 'LOCAL_COMMAND_FAILED' : 'PROCESS_CLEANUP_FAILED';
    child.unref();
    child.stdout.destroy();
    child.stderr.destroy();
    child.stdin.destroy();
    throw new CodexProcessFailure(code, true);
  } finally {
    if (killTimer) clearTimeout(killTimer);
    if (deadline) clearTimeout(deadline);
  }
  // Observation occurs after verified cleanup, including when the operation failed.
  options.onClosed?.({ processClosed: true, temporaryDirectoryRemoved: true, exitCode, signal, spawnError });
  if (failed) throw failure;
  return { result, processClosed: true, temporaryDirectoryRemoved: true };
}
