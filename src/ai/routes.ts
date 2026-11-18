import { apiEndpoints } from '../shared/ai.ts';
import type { NamedApi } from '../shared/ai.ts';
import type { CompatibleService } from './compatible.ts';
import type { AiService } from './service.ts';
import { DshFailure } from './dsh.ts';
import type { DshService } from './dsh.ts';
import { AiProviderError } from './providers.ts';
import type { AiProviders } from './providers.ts';
import { HttpError } from '../http/request.ts';

export function matchAiRoute(method: string | undefined, path: string) {
  for (const provider of Object.keys(apiEndpoints) as NamedApi[]) {
    if (path === '/api/ai/' + provider && (method === 'GET' || method === 'POST')) {
      return { provider, kind: method === 'GET' ? 'status' : 'connect' } as const;
    }
    if (path === '/api/ai/providers/' + provider + '/models' && method === 'GET') return { provider, kind: 'models' } as const;
  }
  if (method === 'GET') {
    if (path === '/api/ai/status') return 'status';
    if (path === '/api/ai/dsh-status') return 'dsh-status';
    if (path === '/api/ai/providers') return 'providers';
    if (path === '/api/ai/providers/codex/models') return 'codex-models';
    if (path === '/api/ai/compatible') return 'compatible-status';
    if (path === '/api/ai/providers/compatible/models') return 'compatible-models';
    if (path === '/api/ai/providers/dsh/models') return 'dsh-models';
  }
  if (method === 'POST') {
    for (const action of ['check', 'sign-in', 'cancel-sign-in', 'verify', 'dsh-check', 'dsh-verify', 'dsh-key', 'compatible'] as const) {
      if (path === '/api/ai/' + action) return action;
    }
  }
  return undefined;
}

export async function dispatchAiRoute(action: NonNullable<ReturnType<typeof matchAiRoute>>, input: unknown, service: AiService,
  providers: AiProviders, dsh?: DshService, compatible?: CompatibleService, named: Partial<Record<NamedApi, CompatibleService>> = {}) {
  if (typeof action === 'object') {
    const api = named[action.provider];
    if (action.kind === 'status') return api?.status() ?? { connected: false, endpoint: apiEndpoints[action.provider] };
    if (!api) throw new HttpError(400, 'Open the desktop app to connect an API.');
    try {
      return action.kind === 'models' ? await providers.models(action.provider, AbortSignal.timeout(30000)) : await api.connect(input);
    } catch { throw new HttpError(400, 'Check the API key, network and model access.'); }
  }
  const confirmed = typeof input === 'object' && input !== null && 'confirmAllowance' in input ? input.confirmAllowance : false;
  if (action === 'dsh-status' || action === 'dsh-check' || action === 'dsh-verify') {
    if (!dsh) return { ready: false, verified: false, message: 'DeepSeek Harness requires the desktop app.' };
    if (action === 'dsh-status') return dsh.status();
    return action === 'dsh-check' ? dsh.check() : dsh.verify(confirmed);
  }
  if (action === 'compatible-status') return compatible?.status() ?? { connected: false, endpoint: '' };
  if (action === 'compatible') {
    if (!compatible) throw new HttpError(400, 'Open the desktop app to save a provider.');
    try { return await compatible.connect(input); }
    catch { throw new HttpError(400, 'Could not connect. Check the endpoint, API key and model listing.'); }
  }
  if (action === 'dsh-key') {
    if (!dsh || !input || typeof input !== 'object' || !('key' in input)) throw new HttpError(400, 'Enter your DeepSeek API key.');
    try { return await dsh.saveKey(input.key); }
    catch (error) { throw new HttpError(400, error instanceof DshFailure ? error.message : 'Could not save the DeepSeek key.'); }
  }
  if (action === 'providers') return providers.connections();
  if (action === 'codex-models' || action === 'dsh-models' || action === 'compatible-models') {
    try { return await providers.models(action === 'codex-models' ? 'codex' : action === 'dsh-models' ? 'dsh' : 'compatible', AbortSignal.timeout(30_000)); }
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
