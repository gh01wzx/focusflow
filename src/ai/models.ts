import { record } from '../codex/client.ts';
import type { CodexClient } from '../codex/client.ts';
import type { PlanningModel } from '../shared/planning-ai.ts';

export async function readCodexModels(client: CodexClient, signal: AbortSignal): Promise<PlanningModel[]> {
  const models = new Map<string, PlanningModel>();
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
  return [...models.values()].slice(0, 250);
}
