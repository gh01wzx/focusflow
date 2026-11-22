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

export const apiEndpoints = {
  openai: 'https://api.openai.com/v1',
  claude: 'https://api.anthropic.com/v1',
  deepseek: 'https://api.deepseek.com',
} as const;
export type NamedApi = keyof typeof apiEndpoints;
export type ApiProvider = NamedApi | 'compatible';
export type AiProvider = 'codex' | 'dsh' | ApiProvider;
function isAiProvider(value: unknown): value is AiProvider {
  return value === 'codex' || value === 'dsh' || value === 'compatible' ||
    (typeof value === 'string' && Object.hasOwn(apiEndpoints, value));
}

export interface AiConnection {
  provider: AiProvider;
  connected: boolean;
}

export function parseAiConnections(value: unknown): AiConnection[] {
  if (!Array.isArray(value)) throw new Error('Could not read AI connections.');
  return value.map((entry: unknown) => {
    if (!entry || typeof entry !== 'object' || !('provider' in entry) || !('connected' in entry)
        || !isAiProvider(entry.provider) || typeof entry.connected !== 'boolean') {
      throw new Error('Could not read an AI connection.');
    }
    return { provider: entry.provider, connected: entry.connected };
  });
}

export const aiProviderNames: Record<AiProvider, string> = { codex: 'Codex', dsh: 'DeepSeek Harness', compatible: 'Compatible API', openai: 'OpenAI API', claude: 'Claude API', deepseek: 'DeepSeek API' };

export interface AiModelSelection {
  provider: AiProvider;
  model: string;
  effort: string;
}

export interface AiModel {
  id: string;
  label: string;
  efforts: string[];
  defaultEffort: string;
}

export const defaultAiModelSelection: AiModelSelection = { provider: 'codex', model: '', effort: '' };
export const DSH_VERSION = '0.2.2-rc.3';

export function parseAiModelSelection(value: unknown): AiModelSelection {
  if (value === undefined) return { ...defaultAiModelSelection };
  if (!value || typeof value !== 'object' || !('provider' in value) || !('model' in value) || !('effort' in value)
      || !isAiProvider(value.provider)
      || typeof value.model !== 'string' || !/^[a-z0-9._:/-]{0,120}$/i.test(value.model)
      || typeof value.effort !== 'string' || !/^[a-z0-9_-]{0,30}$/i.test(value.effort)
      || (!value.model && (value.effort || value.provider !== 'codex'))) {
    throw new Error('Choose a valid AI provider, model and reasoning effort.');
  }
  return { provider: value.provider, model: value.model, effort: value.effort };
}

export function supportsSelection(models: readonly AiModel[], selection: AiModelSelection): boolean {
  return models.some(model => model.id === selection.model && (!selection.effort || model.efforts.includes(selection.effort)));
}

export interface DshStatus {
  ready: boolean;
  verified: boolean;
  message: string;
}

export function parseDshStatus(value: unknown): DshStatus {
  if (!value || typeof value !== 'object' || !('ready' in value) || !('verified' in value) || !('message' in value)
      || typeof value.ready !== 'boolean' || typeof value.verified !== 'boolean' || typeof value.message !== 'string') {
    throw new Error('Could not read DeepSeek Harness connection.');
  }
  return { ready: value.ready, verified: value.verified, message: value.message };
}

export function parseAiModels(value: unknown): AiModel[] {
  if (!Array.isArray(value) || value.length > 250) throw new Error('Could not read available models.');
  return value.map((entry: unknown) => {
    if (!entry || typeof entry !== 'object' || !('id' in entry) || !('label' in entry)
        || !('efforts' in entry) || !('defaultEffort' in entry)
        || typeof entry.id !== 'string' || !entry.id || typeof entry.label !== 'string'
        || typeof entry.defaultEffort !== 'string' || !Array.isArray(entry.efforts)
        || !entry.efforts.every(effort => typeof effort === 'string')) throw new Error('Could not read a model option.');
    return { id: entry.id, label: entry.label, efforts: entry.efforts as string[], defaultEffort: entry.defaultEffort };
  });
}
