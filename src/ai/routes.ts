import type { AiService } from './service.ts';
import type { DshService } from './dsh.ts';
import { readCodexModels } from './models.ts';
import { ProbeFailure } from '../codex/read-only-probe.ts';
import { CodexFailure } from '../codex/client.ts';
import { HttpError } from '../http/request.ts';

export function matchAiRoute(method: string | undefined, path: string) {
  if (method === 'GET' && path === '/api/ai/status') return 'status';
  if (method === 'GET' && path === '/api/ai/codex-models') return 'codex-models';
  if (method === 'GET' && path === '/api/ai/dsh-status') return 'dsh-status';
  if (method === 'POST') {
    for (const action of ['check', 'sign-in', 'cancel-sign-in', 'verify', 'dsh-check', 'dsh-verify'] as const) {
      if (path === '/api/ai/' + action) return action;
    }
  }
  return undefined;
}
export async function dispatchAiRoute(action: NonNullable<ReturnType<typeof matchAiRoute>>, input: unknown, service: AiService,
  dsh?: DshService) {
  const confirmed = typeof input === 'object' && input !== null && 'confirmAllowance' in input ? input.confirmAllowance : false;
  if (action === 'dsh-status' || action === 'dsh-check' || action === 'dsh-verify') {
    if (!dsh) return { ready: false, verified: false, message: 'DeepSeek Harness requires the desktop app.' };
    if (action === 'dsh-status') return dsh.status();
    return action === 'dsh-check' ? dsh.check() : dsh.verify(confirmed);
  }
  if (action === 'codex-models') {
    try {
      return await service.runWithChatGPT((client, _cwd, signal) => readCodexModels(client, signal), AbortSignal.timeout(30_000));
    } catch (error) {
      const code = error instanceof ProbeFailure || error instanceof CodexFailure ? error.code : '';
      throw new HttpError(400, code === 'BUSY' ? 'Wait for the current Codex request to finish.'
        : 'Could not load Codex models. Check your ChatGPT sign-in in AI connection and retry.');
    }
  }
  if (action === 'status') return service.status();
  if (action === 'check') return service.check();
  if (action === 'sign-in') return service.signIn();
  if (action === 'cancel-sign-in') return service.cancel();
  return service.verify(confirmed);
}
