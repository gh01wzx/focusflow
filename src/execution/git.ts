import { spawn } from 'node:child_process';

export class ExecutionFailure extends Error {
  readonly code:string;
  constructor(code: string, message: string) { super(message);this.code=code; }
}
export function gitEnvironment(): NodeJS.ProcessEnv {
  const result: NodeJS.ProcessEnv = { GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' };
  for (const key of ['PATH', 'Path', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH', 'LOCALAPPDATA', 'APPDATA']) {
    if (process.env[key]) result[key] = process.env[key];
  }
  return result;
}
export function git(cwd: string, args: string[], signal?: AbortSignal,trim=true): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('git', ['-c', 'core.hooksPath=NUL', ...args], {
      cwd, env: gitEnvironment(), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '', failed = false;
    child.stderr.resume();
    const stop = () => { failed = true; child.kill(); };
    const timer = setTimeout(stop, 30000);
    signal?.addEventListener('abort', stop, { once: true });
    if (signal?.aborted) stop();
    child.stdout.on('data', (chunk: Buffer) => {
      output += chunk.toString('utf8');
      if (Buffer.byteLength(output) > 4 * 1024 * 1024) stop();
    });
    child.once('error', () => {
      clearTimeout(timer); signal?.removeEventListener('abort', stop);
      reject(new ExecutionFailure('GIT_UNAVAILABLE', 'Git could not start. Install Git for Windows and check the selected folder.'));
    });
    child.once('close', code => {
      clearTimeout(timer); signal?.removeEventListener('abort', stop);
      if (failed || code !== 0) reject(new ExecutionFailure(signal?.aborted ? 'CANCELLED' : 'GIT_FAILED',
        signal?.aborted ? 'The repository operation was stopped. Existing files are retained.' : 'Git could not complete this operation. Check the folder, branch and repository access. No reset or cleanup was performed.'));
      else resolve(trim?output.trim():output);
    });
  });
}
