import { join, resolve } from 'node:path';
import { CodexClient, modelFailureCode, record } from './client.ts';

export const MARKERS = { unit: 'FOCUSFLOW_WRITE_TEST_OK', boundary: 'FOCUSFLOW_BOUNDARY_DENIED', network: 'FOCUSFLOW_NETWORK_DENIED' } as const;
export class WriteTrialFailure extends Error {
  readonly code: string;
  constructor(code: string) { super(`Codex write trial blocked: ${code}`); this.code = code; }
}
export interface WriteTurnOptions {
  commands: Record<keyof typeof MARKERS, string>;
  cancelOnStarted?: boolean;
  signal?: AbortSignal;
  timeoutMs?: number;
  interruptTimeoutMs?: number;
  onProgress?: (kind: 'started' | 'retrying') => void;
}
export interface WriteTurnEvidence {
  checks: Record<keyof typeof MARKERS, boolean>;
  approvalsDenied: number;
  cancellationConfirmed: boolean;
}

async function bounded<T>(operation: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([operation, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new WriteTrialFailure('INTERRUPT_TIMEOUT')), ms);
    })]);
  } finally { if (timer) clearTimeout(timer); }
}

export async function controlledWriteTurn(client: CodexClient, cwd: string, prompt: string, options: WriteTurnOptions): Promise<WriteTurnEvidence> {
  let threadId: string | undefined;
  let turnId: string | undefined;
  const checks = { unit: false, boundary: false, network: false };
  let approvalsDenied = 0;
  const cancelOnStarted = options.cancelOnStarted === true;
  let completed: { id: string; status: string; error: unknown } | undefined;
  let stoppedCode: string | undefined;
  let stop!: (code: string) => void;
  const stopped = new Promise<never>((_, reject) => {
    stop = code => { if (!stoppedCode) { stoppedCode = code; reject(new WriteTrialFailure(code)); } };
  });
  // A stop can arrive synchronously while a request is being written.
  void stopped.catch(() => {});
  let resolveTerminal!: () => void;
  const terminal = new Promise<void>(resolve => { resolveTerminal = resolve; });
  const request = async (method: string, params: unknown) => {
    if (stoppedCode) throw new WriteTrialFailure(stoppedCode);
    const result = await Promise.race([client.request(method, params), stopped]);
    if (stoppedCode) throw new WriteTrialFailure(stoppedCode);
    return result;
  };
  const onAbort = () => stop('CANCELLED');
  const onClose = () => stop('CONNECTION_CLOSED');
  const onApproval = (method: string) => {
    if (method === 'item/commandExecution/requestApproval' || method === 'item/fileChange/requestApproval') approvalsDenied++;
    else stop('UNSUPPORTED_REQUEST');
  };
  const notification = (method: string, raw: unknown) => {
    const params = record(raw);
    if (!threadId || params.threadId !== threadId) return;
    if (method === 'turn/started') {
      const id = record(params.turn).id;
      if (typeof id !== 'string' || (turnId && turnId !== id)) { stop('INVALID_TURN'); return; }
      turnId = id;
      options.onProgress?.('started');
      if (cancelOnStarted) stop('CANCELLED');
    }
    if (turnId && params.turnId !== undefined && params.turnId !== turnId) return;
    if (method === 'item/started' || method === 'item/completed') {
      const item = record(params.item);
      if (!['agentMessage', 'userMessage', 'reasoning', 'plan', 'fileChange', 'commandExecution'].includes(String(item.type))) {
        stop('UNEXPECTED_TOOL'); return;
      }
      if (params.turnId !== turnId) { stop('INVALID_TOOL_TURN'); return; }
      if (item.type === 'fileChange') {
        if (!Array.isArray(item.changes) || item.changes.some(change => {
          const path = record(change).path;
          return typeof path !== 'string' || resolve(cwd, path) !== join(cwd, 'trial.ts');
        })) { stop('UNEXPECTED_FILE_CHANGE'); return; }
      }
      if (method === 'item/completed' && item.type === 'commandExecution') {
        for (const key of ['unit', 'boundary', 'network'] as const) {
          if (item.command === options.commands[key] && item.exitCode === 0 &&
              typeof item.aggregatedOutput === 'string' && item.aggregatedOutput.trim() === MARKERS[key]) checks[key] = true;
        }
      }
    }
    if (method === 'error') {
      if (params.willRetry === true) options.onProgress?.('retrying');
      else stop(modelFailureCode(record(params.error).codexErrorInfo));
    }
    if (method === 'turn/completed') {
      const turn = record(params.turn);
      if (typeof turn.id !== 'string' || typeof turn.status !== 'string' || (turnId && turn.id !== turnId)) return;
      completed = { id: turn.id, status: turn.status, error: turn.error };
      resolveTerminal();
    }
  };
  client.on('notification', notification);
  client.on('approvalDenied', onApproval);
  client.on('closed', onClose);
  options.signal?.addEventListener('abort', onAbort, { once: true });
  const timer = setTimeout(() => stop('TURN_TIMEOUT'), options.timeoutMs ?? 90_000);
  try {
    if (options.signal?.aborted) throw new WriteTrialFailure('CANCELLED');
    const started = record(await request('thread/start', {
      cwd, approvalPolicy: 'on-request', approvalsReviewer: 'user', sandbox: 'workspace-write', ephemeral: true,
      baseInstructions: 'Use only this disposable trial workspace and the supplied toy guard checks. Never read user files or credentials. Do not use Git, external network, package installation, subagents or unrelated tools. Permission escalation is denied; report limits without bypassing them.',
    }));
    const id = record(started.thread).id;
    if (typeof id !== 'string') throw new WriteTrialFailure('INVALID_THREAD');
    threadId = id;
    const startedTurn = record(await request('turn/start', {
      threadId, input: [{ type: 'text', text: prompt }],
      approvalPolicy: 'on-request',
      sandboxPolicy: { type: 'workspaceWrite', writableRoots: [cwd], networkAccess: false,
        excludeSlashTmp: true, excludeTmpdirEnvVar: true },
    }));
    const returnedId = record(startedTurn.turn).id;
    if (typeof returnedId !== 'string' || (turnId && returnedId !== turnId)) throw new WriteTrialFailure('INVALID_TURN');
    turnId = returnedId;
    await Promise.race([terminal, stopped]);
    if (stoppedCode) throw new WriteTrialFailure(stoppedCode);
    if (!completed || completed.id !== turnId) throw new WriteTrialFailure('INVALID_RESULT');
    if (completed.status === 'failed' && record(completed.error).codexErrorInfo != null) {
      throw new WriteTrialFailure(modelFailureCode(record(completed.error).codexErrorInfo));
    }
    if (completed.status !== 'completed') throw new WriteTrialFailure('TURN_NOT_COMPLETED');
    if (cancelOnStarted) throw new WriteTrialFailure('CANCELLATION_NOT_CONFIRMED');
    return { checks, approvalsDenied, cancellationConfirmed: false };
  } catch (error) {
    let acknowledged = false;
    if (threadId && turnId && !completed) {
      try {
        const targetThread = threadId;
        const targetTurn = turnId;
        await bounded((async () => {
          await client.interrupt(targetThread, targetTurn);
          acknowledged = true;
          await terminal;
        })(), options.interruptTimeoutMs ?? 5000);
      } catch { /* Preserve the original failure; the caller still owns process cleanup. */ }
    }
    if (cancelOnStarted && error instanceof WriteTrialFailure && error.code === 'CANCELLED') {
      if (acknowledged && completed && completed.id === turnId && completed.status === 'interrupted') {
        return { checks, approvalsDenied, cancellationConfirmed: true };
      }
      throw new WriteTrialFailure('CANCELLATION_NOT_CONFIRMED');
    }
    throw error;
  } finally {
    clearTimeout(timer);
    client.off('notification', notification);
    client.off('approvalDenied', onApproval);
    client.off('closed', onClose);
    options.signal?.removeEventListener('abort', onAbort);
  }
}
