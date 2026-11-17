import { parseAiConnections, parseAiModels, parseAiStatus, parseDshStatus } from '../shared/ai.ts';
import type { AiProvider } from '../shared/ai.ts';

export function createAiClient(transport: typeof fetch = fetch) {
  async function request(action: string, value?: unknown, signal?: AbortSignal) {
    const response = await transport('/api/ai/' + action, value === undefined ? { ...(signal ? { signal } : {}), cache: 'no-store' } : {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value),
    });
    const payload: unknown = await response.json();
    if (!response.ok) throw new Error(payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string'
      ? payload.error : 'Could not check AI. Retry after checking the local runtime.');
    return payload;
  }
  return { status: async () => parseAiStatus(await request('status')), check: async () => parseAiStatus(await request('check', {})),
    signIn: async () => parseAiStatus(await request('sign-in', {})), cancel: async () => parseAiStatus(await request('cancel-sign-in', {})),
    verify: async (confirmAllowance: boolean) => parseAiStatus(await request('verify', { confirmAllowance })),
    connections: async (signal?: AbortSignal) => parseAiConnections(await request('providers', undefined, signal)),
    models: async (provider: AiProvider, signal?: AbortSignal) =>
      parseAiModels(await request('providers/' + provider + '/models', undefined, signal)),
    dshStatus: async () => parseDshStatus(await request('dsh-status')),
    compatibleStatus: async () => await request('compatible') as { connected: boolean; endpoint: string },
    saveCompatible: async (endpoint: string, key: string) => await request('compatible', { endpoint, key }) as { connected: boolean; endpoint: string },
    saveDshKey: async (key: string) => parseDshStatus(await request('dsh-key', { key })),
    dshCheck: async () => parseDshStatus(await request('dsh-check', {})),
    dshVerify: async (confirmAllowance: boolean) => parseDshStatus(await request('dsh-verify', { confirmAllowance })),
  };
}
