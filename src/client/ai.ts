import { parseAiStatus } from '../shared/ai.ts';

export function createAiClient(transport: typeof fetch = fetch) {
  async function request(action: string, value?: unknown) {
    const response = await transport('/api/ai/' + action, value === undefined ? {} : {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value),
    });
    if (!response.ok) throw new Error('Could not check AI. Retry after checking the local runtime.');
    return parseAiStatus(await response.json());
  }
  return { status: () => request('status'), check: () => request('check', {}),
    signIn: () => request('sign-in', {}), cancel: () => request('cancel-sign-in', {}),
    verify: (confirmAllowance: boolean) => request('verify', { confirmAllowance }) };
}
