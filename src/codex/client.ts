import { EventEmitter } from 'node:events';
import type { Readable, Writable } from 'node:stream';

type FailureCode = 'CLOSED' | 'PROTOCOL' | 'TIMEOUT' | 'RPC_FAILED' | 'NOT_INITIALIZED'
  | 'AUTH_REQUIRED' | 'USAGE_LIMIT' | 'RATE_LIMITED' | 'SANDBOX_FAILED' | 'CONNECTION_FAILED';
export class CodexFailure extends Error {
  readonly code: FailureCode;
  constructor(code: FailureCode) {
    super(`Codex request failed: ${code}`);
    this.code = code;
  }
}

export function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}

interface Pending {
  resolve: (value: unknown) => void;
  reject: (error: CodexFailure) => void;
  timer: ReturnType<typeof setTimeout>;
}

/** Only pinned protocol discriminants are interpreted; provider prose is discarded. */
export function modelFailureCode(info: unknown): FailureCode {
  if (info === 'unauthorized') return 'AUTH_REQUIRED';
  if (info === 'usageLimitExceeded' || info === 'sessionBudgetExceeded') return 'USAGE_LIMIT';
  if (info === 'rateLimitExceeded') return 'RATE_LIMITED';
  if (info === 'sandboxError') return 'SANDBOX_FAILED';
  for (const kind of ['httpConnectionFailed', 'responseStreamConnectionFailed', 'responseStreamDisconnected', 'responseTooManyFailedAttempts']) {
    if (kind in record(info)) {
      const status = record(record(info)[kind]).httpStatusCode;
      if (status === 401) return 'AUTH_REQUIRED';
      if (status === 429) return 'RATE_LIMITED';
      return 'CONNECTION_FAILED';
    }
  }
  return 'RPC_FAILED';
}

/** JSONL transport only. Consumers must not persist raw notifications or responses. */
export class CodexClient extends EventEmitter {
  private approvalHandler: ((method: string, params: Record<string, unknown>) => Promise<'accept' | 'decline' | 'cancel'>) | null = null;
  private readonly incoming = new Set<string>();
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();
  private buffer = '';
  private initialized = false;
  private closed = false;
  private readonly input: Readable;
  private readonly output: Writable;
  private readonly timeoutMs: number;
  private readonly maxLineBytes: number;
  readonly processId: number | null;

  constructor(input: Readable, output: Writable, timeoutMs = 15_000, maxLineBytes = 1_048_576, processId: number | null = null) {
    super();
    this.input = input;
    this.output = output;
    this.timeoutMs = timeoutMs;
    this.maxLineBytes = maxLineBytes;
    this.processId = processId;
    input.setEncoding('utf8');
    input.on('data', this.onData);
    input.once('end', this.onEnd);
    input.once('close', this.onEnd);
    input.once('error', this.onEnd);
    output.once('error', this.onEnd);
  }

  async initialize(): Promise<void> {
    if (this.initialized || this.pending.size !== 0) throw new CodexFailure('PROTOCOL');
    await this.send('initialize', {
      clientInfo: { name: 'focusflow_phase0', version: '0.0.2' },
      capabilities: { experimentalApi: false },
    });
    this.write({ method: 'initialized', params: {} });
    this.initialized = true;
  }

  request(method: string, params: unknown): Promise<unknown> {
    if (!this.initialized) return Promise.reject(new CodexFailure('NOT_INITIALIZED'));
    return this.send(method, params);
  }

  interrupt(threadId: string, turnId: string): Promise<unknown> {
    return this.request('turn/interrupt', { threadId, turnId });
  }

  close(): void { this.fail('CLOSED'); }

  setApprovalHandler(handler: ((method: string, params: Record<string, unknown>) => Promise<'accept' | 'decline' | 'cancel'>) | null): void {
    this.approvalHandler = handler;
  }

  private send(method: string, params: unknown): Promise<unknown> {
    if (this.closed) return Promise.reject(new CodexFailure('CLOSED'));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => this.fail('TIMEOUT'), this.timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.write({ id, method, params });
    });
  }

  private write(value: unknown): void {
    if (this.closed) throw new CodexFailure('CLOSED');
    try { this.output.write(JSON.stringify(value) + '\n'); }
    catch { this.fail('CLOSED'); }
  }

  private readonly onEnd = (): void => { this.fail('CLOSED'); };
  private readonly onData = (chunk: string): void => {
    if (this.closed) return;
    this.buffer += chunk;
    let newline: number;
    while ((newline = this.buffer.indexOf('\n')) !== -1 && !this.closed) {
      const line = this.buffer.slice(0, newline);
      this.buffer = this.buffer.slice(newline + 1);
      if (Buffer.byteLength(line) > this.maxLineBytes) { this.fail('PROTOCOL'); return; }
      if (!line.trim()) continue;
      let message: unknown;
      try { message = JSON.parse(line); }
      catch { this.fail('PROTOCOL'); return; }
      this.receive(record(message));
    }
    if (Buffer.byteLength(this.buffer) > this.maxLineBytes) this.fail('PROTOCOL');
  };

  private receive(message: Record<string, unknown>): void {
    const { id, method, params } = message;
    if (typeof method === 'string') {
      if (id !== undefined) {
        if (typeof id !== 'string' && typeof id !== 'number') { this.fail('PROTOCOL'); return; }
        // Without an explicit interactive owner, preserve the read-only client's denial behavior.
        if (method === 'item/commandExecution/requestApproval' || method === 'item/fileChange/requestApproval') {
          const key = typeof id + ':' + String(id);
          if (this.incoming.has(key)) { this.fail('PROTOCOL'); return; }
          if (this.approvalHandler) {
            this.incoming.add(key);
            const handler = this.approvalHandler;
            void Promise.resolve().then(() => handler(method, record(params))).catch(() => 'decline' as const).then(decision => {
              this.incoming.delete(key);
              if (!this.closed) this.write({ id, result: { decision: ['accept','decline','cancel'].includes(decision) ? decision : 'decline' } });
            });
            return;
          }
          this.write({ id, result: { decision: 'cancel' } });
        } else {
          this.write({ id, error: { code: -32601, message: 'Client request is not supported' } });
        }
        this.emit('approvalDenied', method);
      } else {
        this.emit('notification', method, params);
      }
      return;
    }
    if (typeof id !== 'number' || (!('result' in message) && !('error' in message))) {
      this.fail('PROTOCOL'); return;
    }
    const pending = this.pending.get(id);
    if (!pending) { this.fail('PROTOCOL'); return; }
    this.pending.delete(id);
    clearTimeout(pending.timer);
    if ('error' in message) pending.reject(new CodexFailure(modelFailureCode(record(record(message.error).data).codexErrorInfo)));
    else pending.resolve(message.result);
  }

  private fail(code: FailureCode): void {
    if (this.closed) return;
    this.closed = true;
    this.approvalHandler = null;
    this.incoming.clear();
    this.buffer = '';
    this.input.off('data', this.onData);
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new CodexFailure(code));
    }
    this.pending.clear();
    this.emit('closed', code);
  }
}
