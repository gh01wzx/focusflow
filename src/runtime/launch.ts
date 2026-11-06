import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { STARTUP_STAGES, exitExplanation } from './diagnostics.ts';
import type { StartupStage } from './diagnostics.ts';

export async function runDesktopOnce(executable: string, args: string[], options: {
  cwd: string; environment?: NodeJS.ProcessEnv; timeoutMs?: number; diagnoseOnly?: boolean;
  stage(stage: StartupStage): void;
}) {
  const environment = { ...(options.environment ?? process.env) };
  delete environment.ELECTRON_RUN_AS_NODE;
  const child = spawn(executable, args, { cwd: options.cwd, env: environment, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stderr.resume();
  let ready = false;
  let buffer = '';
  let timeout = false;
  let error = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cleanupTimer: ReturnType<typeof setTimeout> | undefined;
  let settle!: (result: { code: number | null; signal: string | null; closed: boolean }) => void;
  let stopping = false;
  function stop() {
    if (stopping) return;
    stopping = true;
    cleanupTimer = setTimeout(() => {
      child.unref(); child.stdout.destroy(); child.stderr.destroy();
      settle({ code: child.exitCode, signal: null, closed: child.exitCode !== null });
    }, 5000);
    if (child.exitCode !== null || !child.pid) return;
    if (process.platform === 'win32') {
      const killer = spawn(join(environment.SystemRoot ?? 'C:\\Windows', 'System32', 'taskkill.exe'),
        ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
      killer.on('error', () => child.kill('SIGKILL'));
      killer.once('exit', code => { if (code !== 0 && child.exitCode === null) child.kill('SIGKILL'); });
    } else child.kill('SIGKILL');
  }
  const interrupt = () => stop();
  process.once('SIGINT', interrupt);
  child.stdout.on('data', (chunk: Buffer) => {
    buffer += chunk.toString('utf8');
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? '';
    if (buffer.length > 4096) buffer = '';
    for (const line of lines) {
      if (!line.startsWith('FOCUSFLOW_STAGE:')) continue;
      const stage = line.slice('FOCUSFLOW_STAGE:'.length);
      if (!STARTUP_STAGES.some(known => known === stage)) continue;
      options.stage(stage as StartupStage);
      if (stage === 'existing-window' || stage === (options.diagnoseOnly ? 'runtime-ready' : 'window-ready')) {
        ready = true; if (timer) clearTimeout(timer);
      }
    }
  });
  child.once('error', () => { error = true; });
  timer = setTimeout(() => { timeout = true; stop(); }, options.timeoutMs ?? 60_000);
  try {
    const result = await new Promise<{ code: number | null; signal: string | null; closed: boolean }>(resolve => {
      settle = resolve;
      child.once('close', (code, signal) => resolve({ code, signal, closed: true }));
    });
    return { ...result, ready, ok: result.closed && result.code === 0 && ready && !error && !timeout,
      message: !result.closed ? 'Could not confirm the owned process stopped. Do not launch again; retain the last stage and build information for diagnosis.'
        : timeout ? 'Startup timed out. The owned process was stopped once. Do not repeatedly launch it; retain the last stage and build information.'
        : error ? 'The Electron runtime could not be started. Check its installation and file access; do not reset task data or workspace permissions.'
        : exitExplanation(result.code, result.signal, ready) };
  } finally { if (timer) clearTimeout(timer); if (cleanupTimer) clearTimeout(cleanupTimer); process.off('SIGINT', interrupt); }
}
