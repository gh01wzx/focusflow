import type { AiService } from './service.ts';

export function matchAiRoute(method: string | undefined, path: string) {
  if (method === 'GET' && path === '/api/ai/status') return 'status';
  if (method === 'POST') {
    for (const action of ['check', 'sign-in', 'cancel-sign-in', 'verify'] as const) {
      if (path === '/api/ai/' + action) return action;
    }
  }
  return undefined;
}
export async function dispatchAiRoute(action: NonNullable<ReturnType<typeof matchAiRoute>>, input: unknown, service: AiService) {
  if (action === 'status') return service.status();
  if (action === 'check') return service.check();
  if (action === 'sign-in') return service.signIn();
  if (action === 'cancel-sign-in') return service.cancel();
  const confirmed = typeof input === 'object' && input !== null && 'confirmAllowance' in input ? input.confirmAllowance : false;
  return service.verify(confirmed);
}
