import { execFile, spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { git, gitEnvironment, ExecutionFailure } from './git.ts';
import type { CodingWorkspace } from '../shared/execution.ts';
import type { ExecutionRepository } from './repository.ts';

export interface PreviewReceipt {
  pid: number;
  stamp: string;
  stage: 'starting' | 'ready' | 'stopping' | 'stopped' | 'failed' | 'uncertain';
  url: string;
  revision: string;
  command: string;
  profile: string;
}

const activeStage = (preview: PreviewReceipt) => ['starting','ready','stopping','uncertain'].includes(preview.stage);

function processStamp(pid: number): Promise<string | null | undefined> {
  return new Promise(resolve => {
    if (!Number.isSafeInteger(pid) || pid < 1 || process.platform !== 'win32') { resolve(undefined); return; }
    const script = '$p = Get-Process -Id ' + pid + ' -ErrorAction SilentlyContinue; ' +
      "if (!$p) { 'missing' } else { $p.StartTime.ToUniversalTime().Ticks.ToString() }";
    execFile('powershell.exe', ['-NoLogo','-NoProfile','-NonInteractive','-Command',script], {
      windowsHide: true, timeout: 4000, maxBuffer: 4096, env: gitEnvironment(),
    }, (error, stdout) => {
      const value = stdout.trim();
      resolve(error ? undefined : value === 'missing' ? null : /^\d{15,20}$/.test(value) ? value : undefined);
    });
  });
}

export function createPreviewService(repository: Pick<ExecutionRepository, 'preview' | 'savePreview'>) {
  const live = new Map<string, { process: ChildProcess; receipt: PreviewReceipt }>();
  const actions = new Set<string>();
  const queries = new Map<string, Promise<PreviewReceipt | null>>();
  let closed = false;
  function save(id: string, receipt: PreviewReceipt) {
    repository.savePreview(id, receipt);
    return receipt;
  }
  async function lookup(id: string): Promise<PreviewReceipt | null> {
    const owned = live.get(id);
    if (owned) return owned.receipt;
    const saved = repository.preview(id);
    if (!saved || !activeStage(saved)) return saved;
    const pending = queries.get(id);
    if (pending) return pending;
    const query = processStamp(saved.pid).then(stamp => {
      if (stamp === null || stamp && saved.stamp && stamp !== saved.stamp) {
        return save(id, { ...saved, stage: 'stopped', url: '' });
      }
      if (!stamp || !saved.stamp) return { ...saved, stage: 'uncertain' } as const;
      return { ...saved, stage: saved.stage === 'ready' ? 'ready' : 'starting' } as const;
    }).finally(() => { queries.delete(id); });
    queries.set(id, query);
    return query;
  }
  function show(receipt: PreviewReceipt | null) {
    if (!receipt) return null;
    const { stage, url, revision, command, profile } = receipt;
    return { stage, url, revision, command, profile };
  }
  async function state(id: string) { return show(await lookup(id)); }
  async function start(workspace: CodingWorkspace, command: string) {
    const id = workspace.ticketId;
    if (closed || actions.has(id)) throw new ExecutionFailure('PREVIEW_BUSY', 'Wait for the current preview action.');
    actions.add(id);
    try {
      const prior = await lookup(id);
      if (prior && activeStage(prior)) return show(prior);
      if (workspace.state !== 'ready' || process.platform !== 'win32') throw new ExecutionFailure('PREVIEW_UNAVAILABLE', 'Prepare a Windows ticket worktree first.');
      if (command !== 'focusflow' && !/^npm run [A-Za-z0-9:_-]+$/.test(command)) throw new ExecutionFailure('PREVIEW_SETUP', 'Save a preview command in Project settings.');
      const cwd = workspace.workspacePath;
      const branch = await git(cwd, ['branch', '--show-current']);
      if (branch !== workspace.branch) throw new ExecutionFailure('WORKSPACE_CHANGED', 'Open the prepared ticket worktree.');
      const revision = await git(cwd, ['rev-parse', 'HEAD']);
      const dirty = !!await git(cwd, ['status', '--porcelain']);
      if (closed) throw new ExecutionFailure('PREVIEW_CLOSING', 'FocusFlow is closing.');
      const profile = command === 'focusflow' ? 'ticket-' + id : '';
      const commandLine = profile ? 'Start-FocusFlow.cmd --review ' + profile : command;
      const child = spawn('cmd.exe', ['/d', '/c', commandLine], { cwd, windowsHide: true,
        stdio: ['ignore','pipe','pipe'], env: { ...gitEnvironment(), ...(profile ? { FOCUSFLOW_PREVIEW_READY: '1' } : {}) } });
      const receipt: PreviewReceipt = { pid: child.pid ?? 0, stamp: '', stage: 'starting', url: '', command: commandLine, profile,
        revision: revision.slice(0, 12) + (dirty ? ' with local changes' : '') };
      const owned = { process: child, receipt };
      live.set(id, owned);
      function update(change: Partial<PreviewReceipt>) {
        if (closed || live.get(id) !== owned) return;
        owned.receipt = save(id, { ...owned.receipt, ...change });
      }
      let recent = '';
      const output = (buffer: Buffer) => {
        if (owned.receipt.stage !== 'starting') return;
        recent = (recent + buffer.toString('utf8')).slice(-8192);
        if (profile) {
          if (recent.includes('FocusFlow review window ready')) update({ stage: 'ready' });
          return;
        }
        const match = /http:\/\/(?:localhost|127\.0\.0\.1):(\d{1,5})(?:\/[^\s\x1b]*)?/.exec(recent);
        if (match && Number(match[1]) >= 1 && Number(match[1]) <= 65535) {
          update({ url: 'http://127.0.0.1:' + match[1] + '/', stage: 'ready' });
        }
      };
      child.stdout?.on('data', output);
      child.stderr?.on('data', output);
      child.once('error', () => { update({ stage: 'failed' }); live.delete(id); });
      child.once('close', code => {
        update({ stage: owned.receipt.stage === 'stopping' || code === 0 ? 'stopped' : 'failed', url: '' });
        if (live.get(id) === owned) live.delete(id);
      });
      save(id, receipt);
      if (child.pid) {
        const stamp = await processStamp(child.pid);
        if (stamp) update({ stamp });
      }
      return show(live.get(id)?.receipt ?? repository.preview(id));
    } finally { actions.delete(id); }
  }
  async function stop(id: string) {
    if (actions.has(id)) return state(id);
    actions.add(id);
    try {
      const receipt = await lookup(id);
      if (!receipt || !activeStage(receipt)) return show(receipt);
      if (receipt.stage === 'uncertain' || receipt.stage === 'stopping') return show(receipt);
      const owned = live.get(id);
      const stamp = await processStamp(receipt.pid);
      if (stamp === null) return show(save(id, { ...receipt, stage: 'stopped', url: '' }));
      if (!stamp || (receipt.stamp ? stamp !== receipt.stamp : !owned || owned.process.exitCode !== null)) {
        return show({ ...receipt, stage: 'uncertain' });
      }
      const stopping = save(id, { ...receipt, stage: 'stopping', stamp });
      if (owned) owned.receipt = stopping;
      await new Promise<void>(resolve => {
        const kill = spawn('taskkill.exe', ['/PID', String(receipt.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
        const finish = () => resolve();
        kill.once('error', finish); kill.once('close', finish);
      });
      const after = await processStamp(receipt.pid);
      const result = save(id, { ...stopping, stage: after === null || after && after !== stamp ? 'stopped' : 'uncertain', url: '' });
      if (owned && live.get(id) === owned) owned.receipt = result;
      return show(result);
    } finally { actions.delete(id); }
  }
  return { state, start, stop,
    owned(id: string) { const receipt = repository.preview(id); return actions.has(id) || !!receipt && activeStage(receipt); },
    async close() { closed = true; await Promise.allSettled([...live.keys()].map(stop)); },
  };
}
