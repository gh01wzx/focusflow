import { execFile, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promisify } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import { ExecutionFailure, gitEnvironment } from './git.ts';

const run = promisify(execFile);
const macMarker = /(?:^|\s)(focusflow-preview-[a-f0-9-]{36})(?:\s|$)/;

export function launchPreview(cwd: string, command: string, profile: string) {
  const env = { ...gitEnvironment(), ...(profile ? { FOCUSFLOW_PREVIEW_READY: '1' } : {}) };
  const stdio = ['ignore', 'pipe', 'pipe'] as const;
  if (process.platform === 'win32') {
    const label = profile ? 'Start-FocusFlow.cmd --review ' + profile : command;
    const child = spawn('cmd.exe', ['/d', '/c', label], { cwd, env, windowsHide: true, stdio: [...stdio] });
    return { child, label, stamp: '' };
  }
  if (process.platform !== 'darwin') throw new ExecutionFailure('PREVIEW_UNAVAILABLE', 'Open a ticket preview on Windows or macOS.');
  const args = profile ? ['./Start-FocusFlow.command', '--review', profile] : command.split(' ');
  const stamp = 'focusflow-preview-' + randomUUID();
  // Keep a marked shell as the group leader until the foreground command finishes.
  // User arguments go through "$@" and are never evaluated as shell code.
  const child = spawn('/bin/sh', ['-c', '"$@"; exit $?', stamp, ...args], { cwd, env, detached: true, stdio: [...stdio] });
  return { child, label: args.join(' '), stamp };
}

// null means gone. undefined means the process identity could not be read.
export async function processStamp(pid: number): Promise<string | null | undefined> {
  if (!Number.isSafeInteger(pid) || pid < 2) return undefined;
  const options = { timeout: 4000, maxBuffer: 8192, windowsHide: true, env: gitEnvironment() };
  if (process.platform === 'darwin') {
    try {
      const { stdout } = await run('/bin/ps', ['-ww', '-p', String(pid), '-o', 'pgid=', '-o', 'command='], options);
      const match = /^(\d+)\s+(.+)$/.exec(stdout.trim());
      if (!match) return undefined;
      if (Number(match[1]) !== pid) return 'different-process';
      return macMarker.exec(match[2]!)?.[1] ?? 'different-process';
    } catch {
      try { process.kill(pid, 0); } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ESRCH') return null;
      }
      return undefined;
    }
  }
  if (process.platform !== 'win32') return undefined;
  const script = '$p = Get-Process -Id ' + pid + ' -ErrorAction SilentlyContinue; ' +
    "if (!$p) { 'missing' } else { $p.StartTime.ToUniversalTime().Ticks.ToString() }";
  try {
    const { stdout } = await run('powershell.exe', ['-NoLogo','-NoProfile','-NonInteractive','-Command',script], options);
    const value = stdout.trim();
    return value === 'missing' ? null : /^\d{15,20}$/.test(value) ? value : undefined;
  } catch { return undefined; }
}

export async function stopPreviewProcess(pid: number, expected: string): Promise<boolean> {
  const current = await processStamp(pid);
  if (current === null || (current && current !== expected)) return true;
  if (!current || !expected) return false;
  if (process.platform === 'darwin') {
    if (!/^focusflow-preview-[a-f0-9-]{36}$/.test(expected)) return false;
    // Signal the group only after both its leader and unique launch marker match.
    try { process.kill(-pid, 'SIGKILL'); } catch (error) {
      return (error as NodeJS.ErrnoException).code === 'ESRCH';
    }
    for (let attempt = 0; attempt < 15; attempt++) {
      await delay(50);
      const after = await processStamp(pid);
      if (after === null || (after && after !== expected)) return true;
    }
    return false;
  }
  if (process.platform !== 'win32') return false;
  await run('taskkill.exe', ['/PID', String(pid), '/T', '/F'], { timeout: 5000, windowsHide: true }).catch(() => {});
  const after = await processStamp(pid);
  return after === null || (!!after && after !== expected);
}
