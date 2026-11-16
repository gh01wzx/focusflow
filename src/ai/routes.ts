import type { AiService } from './service.ts';
import { DshFailure } from './dsh.ts';
import type { DshService } from './dsh.ts';
import { AiProviderError } from './providers.ts';
import type { AiProviders } from './providers.ts';
import { HttpError } from '../http/request.ts';

export function matchAiRoute(method: string | undefined, path: string) {
  if (method === 'GET') {
    if (path === '/api/ai/status') return 'status';
    if (path === '/api/ai/dsh-status') return 'dsh-status';
    if (path === '/api/ai/providers') return 'providers';
    if (path === '/api/ai/providers/codex/models') return 'codex-models';
    if (path === '/api/ai/providers/dsh/models') return 'dsh-models';
  }
  if (method === 'POST') {
    for (const action of ['check', 'sign-in', 'cancel-sign-in', 'verify', 'dsh-check', 'dsh-verify'] as const) {
      if (path === '/api/ai/' + action) return action;
    }
  }
  return undefined;
}

export async function dispatchAiRoute(action: NonNullable<ReturnType<typeof matchAiRoute>>, input: unknown, service: AiService,
  providers: AiProviders, dsh?: DshService) {
  const confirmed = typeof input === 'object' && input !== null && 'confirmAllowance' in input ? input.confirmAllowance : false;
  if (action === 'dsh-status' || action === 'dsh-check' || action === 'dsh-verify') {
    if (!dsh) return { ready: false, verified: false, message: 'DeepSeek Harness requires the desktop app.' };
    if (action === 'dsh-status') return dsh.status();
    return action === 'dsh-check' ? dsh.check() : dsh.verify(confirmed);
  }
  if (action === 'providers') return providers.connections();
  if (action === 'codex-models' || action === 'dsh-models') {
    try { return await providers.models(action === 'codex-models' ? 'codex' : 'dsh', AbortSignal.timeout(30_000)); }
    catch (error) {
      throw new HttpError(400, error instanceof AiProviderError || error instanceof DshFailure
        ? error.message : 'Could not load models. Check AI connection and try again.');
    }
  }
  if (action === 'status') return service.status();
  if (action === 'check') return service.check();
  if (action === 'sign-in') return service.signIn();
  if (action === 'cancel-sign-in') return service.cancel();
  return service.verify(confirmed);
}
