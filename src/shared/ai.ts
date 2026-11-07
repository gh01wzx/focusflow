export const CODEX_VERSION = '0.166.0';
export const AI_SETUP_URL = 'https://developers.openai.com/codex/cli/';
export type AiMode = 'unchecked' | 'missing' | 'signed-out' | 'chatgpt' | 'unsupported' | 'signing-in' | 'error';
export interface AiStatus {
  mode: AiMode;
  runtimeVersion: string;
  account: string | null;
  plan: string | null;
  message: string;
  signInUrl: string | null;
  verified: boolean;
}
export function parseAiStatus(value: unknown): AiStatus {
  if (!value || typeof value !== 'object') throw new Error('Could not read AI status.');
  const status = value as Record<string, unknown>;
  if (!['unchecked', 'missing', 'signed-out', 'chatgpt', 'unsupported', 'signing-in', 'error'].includes(String(status.mode))
    || typeof status.runtimeVersion !== 'string' || typeof status.message !== 'string' || typeof status.verified !== 'boolean'
    || ![status.account, status.plan, status.signInUrl].every(item => item === null || typeof item === 'string')) {
    throw new Error('Could not read AI status.');
  }
  if (status.signInUrl !== null && !isAiSignInUrl(status.signInUrl as string)) throw new Error('Could not read AI sign-in address.');
  return status as unknown as AiStatus;
}
export function isAiSignInUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.port
      && ['auth.openai.com', 'chatgpt.com'].includes(url.hostname);
  } catch { return false; }
}
