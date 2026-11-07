import type { CodexClient } from '../codex/client.ts';
import { record, CodexFailure } from '../codex/client.ts';
import { readOnlyProbe, ProbeFailure } from '../codex/read-only-probe.ts';
import { CodexProcessFailure } from '../codex/process.ts';
import { CODEX_VERSION, isAiSignInUrl } from '../shared/ai.ts';
import type { AiStatus } from '../shared/ai.ts';

export interface AiRuntime {
  installed(): Promise<boolean>;
  run(operation: (client: CodexClient, cwd: string) => Promise<AiStatus>): Promise<AiStatus>;
}
const initial: AiStatus = { mode: 'unchecked', runtimeVersion: CODEX_VERSION, account: null, plan: null,
  message: 'Check your FocusFlow AI account before using a model.', signInUrl: null, verified: false };
function failureMessage(error: unknown) {
  const code = error instanceof CodexFailure || error instanceof ProbeFailure || error instanceof CodexProcessFailure
    ? error.code : 'LOCAL_RUNTIME_FAILED';
  if (code === 'AUTH_REQUIRED') return 'Sign in with ChatGPT again. The previous authorization is no longer usable.';
  if (code === 'USAGE_LIMIT') return 'The Codex allowance is exhausted. Check your ChatGPT plan and try after its limit resets.';
  if (code === 'RATE_LIMITED') return 'Codex is rate limited. Wait before trying again.';
  if (code === 'CONNECTION_FAILED') return 'Codex could not connect. Check your network and try again.';
  if (code === 'TIMEOUT') return 'Codex did not respond in time. Check your connection and retry Check account or sign-in.';
  if (code === 'CANCELLED') return 'The AI check was stopped. A request already sent may still use allowance.';
  return 'The Codex runtime could not complete this check. Check the pinned installation and OS credential-store access, then retry.';
}
function accountStatus(value: unknown): AiStatus {
  const account = record(record(value).account);
  if (account.type !== 'chatgpt') return { ...initial, mode: account.type ? 'unsupported' : 'signed-out',
    message: account.type ? 'This auth mode is not supported here. Sign in with ChatGPT; FocusFlow will not use API-key billing.'
      : 'Sign in with ChatGPT for FocusFlow. Existing Codex App sessions are not copied.' };
  return { ...initial, mode: 'chatgpt',
    account: typeof account.email === 'string' && account.email.length <= 254 ? account.email : 'ChatGPT account',
    plan: typeof account.planType === 'string' && account.planType.length <= 80 ? account.planType : null,
    message: 'ChatGPT sign-in is available. A model check consumes your Codex allowance.' };
}
export function createAiService(runtime: AiRuntime, probe = readOnlyProbe) {
  let state = { ...initial };
  let pending = false;
  let login: { client: CodexClient; id: string; cancelled: boolean; finish(): void } | null = null;
  let task: Promise<AiStatus> | null = null;
  let active: Promise<AiStatus> | null = null;
  let probing = false;
  const abort = new AbortController();
  const status = () => ({ ...state });
  function execute(operation: (client: CodexClient, cwd: string) => Promise<AiStatus>): Promise<AiStatus> {
    if (pending || abort.signal.aborted) return Promise.resolve(status());
    pending = true;
    active = (async () => {
      try {
        if (!await runtime.installed()) {
          state = { ...initial, mode: 'missing', message: 'Install the pinned official Codex runtime using npm run ai:install, then Check account.' };
        } else if (!abort.signal.aborted) state = await runtime.run(async (client, cwd) => {
          // Account/login requests need cancellation too, before a probe exists.
          const cancelRequest = () => { if (!probing) client.close(); };
          abort.signal.addEventListener('abort', cancelRequest, { once: true });
          try {
            if (abort.signal.aborted) throw new ProbeFailure('CANCELLED');
            return await operation(client, cwd);
          } finally { abort.signal.removeEventListener('abort', cancelRequest); }
        });
      } catch (error) { state = { ...initial, mode: 'error', message: failureMessage(error) }; }
      finally { pending = false; }
      return status();
    })();
    return active;
  }
  async function check() {
    return execute(async client => { await client.initialize(); return accountStatus(await client.request('account/read', { refreshToken: false })); });
  }
  async function signIn() {
    if (pending) return status();
    let announced!: () => void;
    const started = new Promise<void>(resolve => { announced = resolve; });
    task = execute(async client => {
      await client.initialize();
      let finish!: () => void;
      const completed = new Promise<void>(resolve => { finish = resolve; });
      let succeeded = false;
      const early: { id: string; success: boolean }[] = [];
      const notification = (method: string, params: unknown) => {
        const event = record(params);
        if (method === 'account/login/completed' && typeof event.loginId === 'string') {
          if (event.loginId === login?.id) { succeeded = event.success === true; finish(); }
          else if (early.length < 4) early.push({ id: event.loginId, success: event.success === true });
        }
      };
      client.on('notification', notification);
      client.once('closed', finish);
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const reply = record(await client.request('account/login/start', { type: 'chatgpt' }));
        if (typeof reply.loginId !== 'string' || typeof reply.authUrl !== 'string' || !isAiSignInUrl(reply.authUrl)) {
          throw new Error('Invalid sign-in response');
        }
        const owned = { client, id: reply.loginId, cancelled: false, finish };
        login = owned;
        const completedEarly = early.find(event => event.id === reply.loginId);
        if (completedEarly) { succeeded = completedEarly.success; finish(); }
        state = { ...initial, mode: 'signing-in', signInUrl: reply.authUrl, message: 'Continue in your browser, then Check account.' };
        announced();
        timer = setTimeout(finish, 180_000);
        await completed;
        if (owned.cancelled) return { ...initial, mode: 'signed-out', message: 'Sign-in cancelled. You can start it again when ready.' };
        if (!succeeded) {
          await client.request('account/login/cancel', { loginId: reply.loginId }).catch(() => {});
          return { ...initial, mode: 'signed-out', message: 'Sign-in ended without completion. Start it again when ready.' };
        }
        return accountStatus(await client.request('account/read', { refreshToken: false }));
      } finally { if (timer) clearTimeout(timer); login = null; client.off('notification', notification); client.off('closed', finish); }
    });
    void task.finally(announced);
    await started;
    return status();
  }
  return {
    status, check, signIn,
    async cancel() {
      const owned = login;
      if (owned) {
        owned.cancelled = true;
        // Local cancellation must not wait for an unresponsive provider reply.
        void owned.client.request('account/login/cancel', { loginId: owned.id }).catch(() => {});
        owned.finish();
        owned.client.close();
      }
      if (task) await task;
      return status();
    },
    async verify(confirmed: unknown) {
      if (confirmed !== true) return { ...status(), message: 'Confirm that this read-only check uses Codex allowance before starting.' };
      return execute(async (client, cwd) => {
        await client.initialize();
        const account = accountStatus(await client.request('account/read', { refreshToken: false }));
        if (account.mode !== 'chatgpt') return account;
        probing = true;
        try {
          await probe(client, cwd, { signal: abort.signal });
          if (abort.signal.aborted) throw new ProbeFailure('CANCELLED');
        } finally { probing = false; }
        return { ...account, verified: true, message: 'One read-only model response was verified. This does not verify code-writing permissions.' };
      });
    },
    async close() { abort.abort(); if (login) login.finish(); if (active) await active; },
  };
}
export type AiService = ReturnType<typeof createAiService>;
