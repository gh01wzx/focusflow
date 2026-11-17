import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { git, gitEnvironment, ExecutionFailure } from './git.ts';
import type { CodingWorkspace } from '../shared/execution.ts';

interface Preview {
  process: ChildProcess;
  stage: 'starting' | 'ready' | 'stopping' | 'stopped' | 'failed';
  url: string;
  revision: string;
  command: string;
}
export function createPreviewService() {
  const active = new Map<string, Preview>();
  const starting = new Set<string>();
  let closed = false;
  function state(id: string) {
    const item = active.get(id);
    return item ? { stage: item.stage, url: item.url, revision: item.revision, command: item.command } : null;
  }
  async function start(workspace: CodingWorkspace, command: string) {
    const id = workspace.ticketId;
    const prior = active.get(id);
    if (prior && ['starting','ready','stopping'].includes(prior.stage)) return state(id);
    if (closed || starting.has(id)) throw new ExecutionFailure('PREVIEW_BUSY', 'Wait for preview setup.');
    if (workspace.state !== 'ready' || process.platform !== 'win32') throw new ExecutionFailure('PREVIEW_UNAVAILABLE', 'Prepare a Windows ticket worktree first.');
    if (command !== 'focusflow' && !/^npm run [A-Za-z0-9:_-]+$/.test(command)) throw new ExecutionFailure('PREVIEW_SETUP', 'Save a preview command in Project settings.');
    starting.add(id);
    try {
      const cwd = workspace.workspacePath;
      const branch = await git(cwd, ['branch', '--show-current']);
      if (branch !== workspace.branch) throw new ExecutionFailure('WORKSPACE_CHANGED', 'Open the prepared ticket worktree.');
      const revision = await git(cwd, ['rev-parse', 'HEAD']);
      const dirty = !!await git(cwd, ['status', '--porcelain']);
      if (closed) throw new ExecutionFailure('PREVIEW_CLOSING', 'FocusFlow is closing.');
      const review = 'ticket-' + id;
      const commandLine = command === 'focusflow' ? 'Start-FocusFlow.cmd --review ' + review : command;
      const child = spawn('cmd.exe', ['/d', '/c', commandLine], { cwd, windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'], env: gitEnvironment() });
      const item: Preview = { process: child, stage: 'starting', url: '', command: commandLine,
        revision: revision.slice(0, 12) + (dirty ? ' with local changes' : '') };
      active.set(id, item);
      let recent = '';
      const output = (buffer: Buffer) => {
        recent = (recent + buffer.toString('utf8')).slice(-8192);
        const match = /http:\/\/(?:localhost|127\.0\.0\.1):(\d{1,5})(?:\/[^\s\x1b]*)?/.exec(recent);
        if (match && Number(match[1]) >= 1 && Number(match[1]) <= 65535 && item.stage === 'starting') {
          item.url = 'http://127.0.0.1:' + match[1] + '/'; item.stage = 'ready';
        }
      };
      child.stdout?.on('data', output);
      child.stderr?.on('data', output);
      child.once('spawn', () => { if (command === 'focusflow' && item.stage === 'starting') item.stage = 'ready'; });
      child.once('error', () => { item.stage = 'failed'; });
      child.once('close', code => { item.stage = item.stage === 'stopping' || code === 0 ? 'stopped' : 'failed'; });
      return state(id);
    } finally { starting.delete(id); }
  }
  async function stop(id: string) {
    const item = active.get(id);
    if (!item || !item.process.pid || !['starting','ready'].includes(item.stage)) return state(id);
    const pid = item.process.pid;
    item.stage = 'stopping';
    await new Promise<void>(resolve => {
      const kill = spawn('taskkill.exe', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
      const finish = () => resolve();
      kill.once('error', finish); kill.once('close', finish);
    });
    if (item.process.exitCode !== null || item.process.signalCode !== null) item.stage = 'stopped';
    else if (item.stage === 'stopping') item.stage = 'failed';
    return state(id);
  }
  return { state, start, stop, async close() { closed = true; await Promise.allSettled([...active.keys()].map(stop)); } };
}
