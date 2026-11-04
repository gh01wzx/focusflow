import { CodexClient, modelFailureCode, record } from './client.ts';

export const PROBE_MARKER = 'FOCUSFLOW_CODEX_OK';
export class ProbeFailure extends Error {
  readonly code: string;
  constructor(code: string) { super(`Codex probe blocked: ${code}`); this.code = code; }
}

export interface ProbeEvidence {
  status: 'verified';
  check: 'read-only-model-turn';
  deltaEvents: number;
  markerMatched: true;
}
export interface CancellationEvidence {
  status: 'verified';
  check: 'read-only-turn-cancellation';
  interruptAcknowledged: true;
  interruptedObserved: true;
}
interface ProbeOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  interruptTimeoutMs?: number;
  onProgress?: (kind: 'delta' | 'started' | 'retrying') => void;
}

async function bounded<T>(operation: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([operation, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new ProbeFailure('INTERRUPT_TIMEOUT')), ms);
    })]);
  } finally { if (timer) clearTimeout(timer); }
}

export function readOnlyProbe(client: CodexClient, cwd: string, options: ProbeOptions = {}): Promise<ProbeEvidence> {
  return runProbe(client, cwd, options, false) as Promise<ProbeEvidence>;
}

/** Cancels one real turn as soon as its started event identifies the target. */
export function cancelReadOnlyProbe(client: CodexClient, cwd: string, options: ProbeOptions = {}): Promise<CancellationEvidence> {
  return runProbe(client, cwd, options, true) as Promise<CancellationEvidence>;
}

async function runProbe(client: CodexClient, cwd: string, options: ProbeOptions, cancelOnStarted: boolean): Promise<ProbeEvidence | CancellationEvidence> {
  let threadId: string | undefined;
  let turnId: string | undefined;
  let deltaEvents = 0;
  let finalText = '';
  let completed: { id: string; status: string; error: unknown } | undefined;
  let stoppedCode: string | undefined;
  let stop!: (code: string) => void;
  const stopped = new Promise<never>((_, reject) => {
    stop = code => { if (!stoppedCode) { stoppedCode = code; reject(new ProbeFailure(code)); } };
  });
  // A stop can arrive synchronously while a request is being written.
  void stopped.catch(() => {});
  let resolveTerminal!: () => void;
  const terminal = new Promise<void>(resolve => { resolveTerminal = resolve; });
  const request = async (method: string, params: unknown) => {
    if (stoppedCode) throw new ProbeFailure(stoppedCode);
    const result = await Promise.race([client.request(method, params), stopped]);
    if (stoppedCode) throw new ProbeFailure(stoppedCode);
    return result;
  };
  const onAbort = () => stop('CANCELLED');
  const onClose = () => stop('CONNECTION_CLOSED');
  const onApproval = () => stop('APPROVAL_DENIED');
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
    if (method === 'item/agentMessage/delta') {
      deltaEvents++;
      options.onProgress?.('delta');
    }
    if (method === 'item/started' || method === 'item/completed') {
      const item = record(params.item);
      if (!['agentMessage', 'userMessage', 'reasoning', 'plan'].includes(String(item.type))) {
        stop('UNEXPECTED_TOOL'); return;
      }
      if (method === 'item/completed' && item.type === 'agentMessage' && typeof item.text === 'string') {
        if (finalText.length + item.text.length > 4096) { stop('OUTPUT_LIMIT'); return; }
        finalText += item.text;
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
    if (options.signal?.aborted) throw new ProbeFailure('CANCELLED');
    const started = record(await request('thread/start', {
      cwd, approvalPolicy: 'never', sandbox: 'read-only', ephemeral: true,
      baseInstructions: 'This is a connectivity probe. Do not use tools, read files, run commands or access the network. Reply only with the requested marker.',
    }));
    const id = record(started.thread).id;
    if (typeof id !== 'string') throw new ProbeFailure('INVALID_THREAD');
    threadId = id;
    const startedTurn = record(await request('turn/start', {
      threadId, input: [{ type: 'text', text: `Reply with exactly ${PROBE_MARKER}. Do not use any tools.` }],
    }));
    const returnedId = record(startedTurn.turn).id;
    if (typeof returnedId !== 'string' || (turnId && returnedId !== turnId)) throw new ProbeFailure('INVALID_TURN');
    turnId = returnedId;
    await Promise.race([terminal, stopped]);
    if (stoppedCode) throw new ProbeFailure(stoppedCode);
    if (!completed || completed.id !== turnId) throw new ProbeFailure('INVALID_RESULT');
    if (completed.status === 'failed' && record(completed.error).codexErrorInfo != null) {
      throw new ProbeFailure(modelFailureCode(record(completed.error).codexErrorInfo));
    }
    if (completed.status !== 'completed') throw new ProbeFailure('TURN_NOT_COMPLETED');
    if (cancelOnStarted) throw new ProbeFailure('CANCELLATION_NOT_CONFIRMED');
    if (finalText.trim() !== PROBE_MARKER) throw new ProbeFailure('MARKER_MISMATCH');
    return { status: 'verified', check: 'read-only-model-turn', deltaEvents, markerMatched: true };
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
    if (cancelOnStarted && error instanceof ProbeFailure && error.code === 'CANCELLED') {
      if (acknowledged && completed && completed.id === turnId && completed.status === 'interrupted') {
        return { status: 'verified', check: 'read-only-turn-cancellation', interruptAcknowledged: true, interruptedObserved: true };
      }
      throw new ProbeFailure('CANCELLATION_NOT_CONFIRMED');
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
