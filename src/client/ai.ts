import { parseAiStatus } from '../shared/ai.ts';
import { parseDshStatus, parsePlanningModels } from '../shared/planning-ai.ts';

export function createAiClient(transport: typeof fetch = fetch) {
  async function request(action: string, value?: unknown) {
    const response = await transport('/api/ai/' + action, value === undefined ? {} : {
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
    codexModels: async () => parsePlanningModels(await request('codex-models')),
    dshStatus: async () => parseDshStatus(await request('dsh-status')),
    dshCheck: async () => parseDshStatus(await request('dsh-check', {})),
    dshVerify: async (confirmAllowance: boolean) => parseDshStatus(await request('dsh-verify', { confirmAllowance })),
  };
}
