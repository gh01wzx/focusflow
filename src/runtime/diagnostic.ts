import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve, sep } from 'node:path';

export const RUNTIME_MARKER = 'FOCUSFLOW_RUNTIME_OK';
export interface RuntimeDiagnostic { status: 'verified' | 'failed'; reason: string; exitCode: string | null }
/** One owned, data-free attempt. Raw process output is never returned. */
export function diagnoseRuntime(executable: string, args: string[], timeoutMs = 15000, testProfile?: string): Promise<RuntimeDiagnostic> {
  return new Promise(resolve => {
    try {
    const environment: NodeJS.ProcessEnv = {};
    for (const key of ['PATH','Path','SystemRoot','WINDIR','USERPROFILE','APPDATA','LOCALAPPDATA','TEMP','TMP']) if (process.env[key]) environment[key] = process.env[key];
    if (testProfile) environment.FOCUSFLOW_TEST_PROFILE = testProfile;
    const child = spawn(executable, args, { env: environment, stdio: ['ignore','pipe','ignore'], windowsHide: true });
    let output = '', timedOut = false, done = false;
    const finish = (result: RuntimeDiagnostic) => { if (done) return; done = true; clearTimeout(timer); resolve(result); };
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, timeoutMs);
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => { if (output.length + chunk.length <= 4096) output += chunk; });
    child.once('error', error => finish({ status: 'failed', reason: 'code' in error && error.code === 'ENOENT' ? 'MISSING_RUNTIME' : 'RUNTIME_START_FAILED', exitCode: null }));
    child.once('close', code => {
      const success = !timedOut && code === 0 && output.split(/\r?\n/).includes(RUNTIME_MARKER);
      finish({ status: success ? 'verified' : 'failed', reason: timedOut ? 'RUNTIME_TIMEOUT' : success ? 'RUNTIME_READY' : code === 0 ? 'READY_SIGNAL_MISSING' : 'NATIVE_RUNTIME_EXIT',
        exitCode: code === null ? null : '0x' + (code >>> 0).toString(16).padStart(8, '0') });
    });
    } catch { resolve({ status: 'failed', reason: 'RUNTIME_START_FAILED', exitCode: null }); }
  });
}

export async function diagnoseDesktopRuntime(executable: string, args: string[], timeoutMs = 15000) {
  const root = await mkdtemp(join(tmpdir(), 'focusflow-runtime-diagnostic-'));
  const profile = join(root, 'guard-profile');
  try {
    const result = await diagnoseRuntime(executable, args, timeoutMs, profile);
    const touched = existsSync(profile);
    return { ...result, ...(touched ? { status: 'failed' as const, reason: 'DIAGNOSTIC_OPENED_TASK_PROFILE' } : {}), attempts: 1, taskDataOpened: touched };
  } finally {
    if (!resolve(root).startsWith(resolve(tmpdir()) + sep) || !basename(root).startsWith('focusflow-runtime-diagnostic-')) throw new Error('Invalid diagnostic cleanup target.');
    await rm(root, { recursive: true, force: true });
  }
}
