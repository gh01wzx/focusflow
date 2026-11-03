import { CodexClient, record } from './client.ts';

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

/** A single ephemeral turn. This is not a code execution or sandbox security test. */
export async function readOnlyProbe(
  client: CodexClient, cwd: string,
  options: { signal?: AbortSignal; timeoutMs?: number; onProgress?: (kind: 'delta' | 'started') => void } = {},
): Promise<ProbeEvidence> {
  let threadId: string | undefined;
  let turnId: string | undefined;
  let deltaEvents = 0;
  let finalText = '';
  let completed: { id: string; status: string } | undefined;
  let failure: string | undefined;
  let resolveOutcome!: () => void;
  const outcome = new Promise<void>(resolve => { resolveOutcome = resolve; });
  const stop = (code: string) => { failure ??= code; resolveOutcome(); };
  const onAbort = () => stop('CANCELLED');
  const onClose = () => stop('CONNECTION_CLOSED');
  const onApproval = () => stop('APPROVAL_DENIED');
  const notification = (method: string, raw: unknown) => {
    const params = record(raw);
    if (!threadId || params.threadId !== threadId) return;
    if (method === 'turn/started') {
      const id = record(params.turn).id;
      if (typeof id === 'string') turnId = id;
      options.onProgress?.('started');
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
    if (method === 'error') stop('MODEL_ERROR');
    if (method === 'turn/completed') {
      const turn = record(params.turn);
      if (typeof turn.id !== 'string' || typeof turn.status !== 'string') { stop('INVALID_RESULT'); return; }
      completed = { id: turn.id, status: turn.status };
      resolveOutcome();
    }
  };
  client.on('notification', notification);
  client.on('approvalDenied', onApproval);
  client.on('closed', onClose);
  options.signal?.addEventListener('abort', onAbort, { once: true });
  const timer = setTimeout(() => stop('TURN_TIMEOUT'), options.timeoutMs ?? 90_000);
  try {
    if (options.signal?.aborted) throw new ProbeFailure('CANCELLED');
    const started = record(await client.request('thread/start', {
      cwd, approvalPolicy: 'never', sandbox: 'read-only', ephemeral: true,
      baseInstructions: 'This is a connectivity probe. Do not use tools, read files, run commands or access the network. Reply only with the requested marker.',
    }));
    const id = record(started.thread).id;
    if (typeof id !== 'string') throw new ProbeFailure('INVALID_THREAD');
    threadId = id;
    if (failure) throw new ProbeFailure(failure);
    const startedTurn = record(await client.request('turn/start', {
      threadId, input: [{ type: 'text', text: `Reply with exactly ${PROBE_MARKER}. Do not use any tools.` }],
    }));
    const returnedId = record(startedTurn.turn).id;
    if (typeof returnedId !== 'string' || (turnId && returnedId !== turnId)) throw new ProbeFailure('INVALID_TURN');
    turnId = returnedId;
    await outcome;
    if (failure) throw new ProbeFailure(failure);
    if (!completed || completed.id !== turnId || completed.status !== 'completed') throw new ProbeFailure('TURN_NOT_COMPLETED');
    if (finalText.trim() !== PROBE_MARKER) throw new ProbeFailure('MARKER_MISMATCH');
    return { status: 'verified', check: 'read-only-model-turn', deltaEvents, markerMatched: true };
  } catch (error) {
    if (threadId && turnId && !completed) {
      try { await client.interrupt(threadId, turnId); } catch { /* Process cleanup is owned by the caller. */ }
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
