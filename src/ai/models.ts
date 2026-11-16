import { record } from '../codex/client.ts';
import type { CodexClient } from '../codex/client.ts';
import type { AiModel } from '../shared/ai.ts';

export async function readCodexModels(client: CodexClient, signal: AbortSignal, verifyFresh?: () => Promise<void>): Promise<AiModel[]> {
  const cancel = () => client.close();
  signal.addEventListener('abort', cancel, { once: true });
  try {
    const models = new Map<string, AiModel>();
    let cursor: string | undefined;
    for (let page = 0; page < 5; page++) {
      signal.throwIfAborted();
      const result = record(await client.request('model/list', { includeHidden: false, limit: 50, ...(cursor ? { cursor } : {}) }));
      if (!Array.isArray(result.data)) throw new Error('Codex model list is unavailable.');
      for (const raw of result.data) {
        const entry = record(raw);
        if (entry.hidden === true || typeof entry.model !== 'string' || !/^[a-z0-9._-]{1,120}$/i.test(entry.model)
            || (Array.isArray(entry.inputModalities) && !entry.inputModalities.includes('text'))) continue;
        const advertised: unknown[] = Array.isArray(entry.supportedReasoningEfforts) ? entry.supportedReasoningEfforts : [];
        const efforts = [...new Set(advertised.map(value => record(value).reasoningEffort)
          .filter((effort): effort is string => typeof effort === 'string' && /^[a-z0-9_-]{1,30}$/i.test(effort)))];
        const defaultEffort = typeof entry.defaultReasoningEffort === 'string' && efforts.includes(entry.defaultReasoningEffort)
          ? entry.defaultReasoningEffort : '';
        models.set(entry.model, { id: entry.model, label: typeof entry.displayName === 'string' ? entry.displayName : entry.model,
          efforts, defaultEffort });
      }
      if (typeof result.nextCursor !== 'string' || !result.nextCursor || result.nextCursor === cursor) break;
      cursor = result.nextCursor;
    }
    await verifyFresh?.();
    signal.throwIfAborted();
    return [...models.values()].slice(0, 250);
  } finally { signal.removeEventListener('abort', cancel); }
}

export async function readDeepSeekMetadata(resource: 'models' | 'user/balance', key: string, signal: AbortSignal): Promise<unknown> {
  const response = await fetch('https://api.deepseek.com/' + resource, {
    headers: { Accept: 'application/json', Authorization: 'Bearer ' + key },
    cache: 'no-store', redirect: 'error', signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]),
  });
  if (response.status === 401 || response.status === 403) {
    await response.body?.cancel();
    throw new DeepSeekAuthError('DeepSeek did not accept the API key. Check it in AI connection.');
  }
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error('DeepSeek metadata is unavailable.');
  }
  return response.json();
}

export class DeepSeekAuthError extends Error {}

export async function readDeepSeekModels(key: string, signal: AbortSignal): Promise<AiModel[]> {
  const result = record(await readDeepSeekMetadata('models', key, signal));
  if (!Array.isArray(result.data)) throw new Error('DeepSeek model list is unavailable.');
  const models = new Map<string, AiModel>();
  for (const raw of result.data.slice(0, 250)) {
    const entry = record(raw);
    if (typeof entry.id !== 'string' || !/^[a-z0-9._-]{1,120}$/i.test(entry.id)
        || (Array.isArray(entry.input_modalities) && !entry.input_modalities.includes('text'))
        || (Array.isArray(entry.output_modalities) && !entry.output_modalities.includes('text'))) continue;
    const info = record(entry.effort);
    const advertised: unknown[] = Array.isArray(info.supported_levels) ? info.supported_levels : [];
    const efforts = [...new Set(advertised.filter((effort): effort is string =>
      typeof effort === 'string' && /^[a-z0-9_-]{1,30}$/i.test(effort)))];
    models.set(entry.id, { id: entry.id, label: typeof entry.name === 'string' ? entry.name : entry.id, efforts,
      defaultEffort: typeof info.default_level === 'string' && efforts.includes(info.default_level) ? info.default_level : '' });
  }
  return [...models.values()];
}
