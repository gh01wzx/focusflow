import { spawn } from 'node:child_process';
import { join } from 'node:path';

export function installerEnvironment(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {};
  for (const key of ['PATH', 'Path', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH',
    'LOCALAPPDATA', 'APPDATA', 'COMSPEC', 'USERNAME', 'USERDOMAIN', 'PSModulePath', 'ProgramData', 'ALLUSERSPROFILE',
    'ProgramFiles', 'ProgramFiles(x86)', 'CommonProgramFiles', 'CommonProgramFiles(x86)', 'PATHEXT']) {
    if (source[key]) environment[key] = source[key];
  }
  return environment;
}

export function runInstallerProcess(executable: string, args: string[], environment: NodeJS.ProcessEnv, timeoutMs = 120000) {
  const started = Date.now();
  // Inherited pipes can remain open after the installer parent has exited.
  // The installer contract is its actual parent exit, followed by installed-file checks.
  const child = spawn(executable, args, { env: environment, windowsHide: true, stdio: 'ignore' });
  return new Promise<{ pid: number | null; code: number | null; exited: boolean; timedOut: boolean;
    spawnFailed: boolean; elapsedMs: number }>(resolve => {
    let timedOut = false;
    let done = false;
    let cleanup: ReturnType<typeof setTimeout> | undefined;
    const finish = (code: number | null, exited: boolean, spawnFailed = false) => {
      if (done) return;
      done = true; clearTimeout(deadline); if (cleanup) clearTimeout(cleanup);
      resolve({ pid: child.pid ?? null, code, exited, timedOut, spawnFailed, elapsedMs: Date.now() - started });
    };
    child.once('error', () => finish(null, true, true));
    child.once('exit', code => finish(code, true));
    const deadline = setTimeout(() => {
      timedOut = true;
      cleanup = setTimeout(() => {
        child.unref(); finish(child.exitCode, child.exitCode !== null || child.signalCode !== null);
      }, 5000);
      if (!child.pid) { finish(null, true, true); return; }
      if (process.platform === 'win32') {
        const killer = spawn(join(environment.SystemRoot ?? 'C:\\Windows', 'System32', 'taskkill.exe'),
          ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
        killer.on('error', () => child.kill('SIGKILL'));
        killer.once('exit', code => { if (code !== 0 && child.exitCode === null) child.kill('SIGKILL'); });
      } else child.kill('SIGKILL');
    }, timeoutMs);
  });
}
