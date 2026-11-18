import type { AiModel, AiModelSelection } from '../shared/ai.ts';
import type { ApiProvider } from '../shared/ai.ts';
import { apiEndpoints, supportsSelection } from '../shared/ai.ts';

interface Connection { endpoint: string; key: string; provider: ApiProvider }
interface Credential { read(): Promise<string | undefined>; write(value: string): Promise<void> }
function normalize(value: unknown) {
  if (typeof value !== 'string' || value.length > 800) throw new Error('Enter an API base URL.');
  const url = new URL(value.trim());
  const local = ['localhost','127.0.0.1','[::1]'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !(local && url.protocol === 'http:')) || url.username || url.password || url.search || url.hash) {
    throw new Error('Use HTTPS or an HTTP loopback endpoint.');
  }
  return url.href.replace(/\/+$/, '');
}
async function call(connection: Connection, path: string, signal: AbortSignal, body?: unknown) {
  const response = await fetch(connection.endpoint + path, {
    redirect: 'error', signal, cache: 'no-store',
    headers: { Accept: 'application/json', ...(connection.provider === 'claude' ? { 'x-api-key': connection.key, 'anthropic-version': '2023-06-01' }
        : connection.key ? { Authorization: 'Bearer ' + connection.key } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(response.status === 401 || response.status === 403
      ? 'The provider refused the API key.' : 'The provider could not complete the request.');
  }
  if (!response.body) throw new Error('Empty provider response.');
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let output = '';
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      output += decoder.decode(next.value, { stream: true });
      if (output.length > 1000000) throw new Error('Provider response exceeded the local size limit.');
    }
    return JSON.parse(output + decoder.decode()) as Record<string, unknown>;
  } finally { await reader.cancel().catch(() => {}); }
}
async function modelList(connection: Connection, signal: AbortSignal): Promise<AiModel[]> {
  const payload = await call(connection, '/models', signal);
  if (!Array.isArray(payload.data)) throw new Error('The endpoint did not return a model list.');
  return payload.data.slice(0, 250).flatMap((item: Record<string, unknown> | null) => {
    if (!item || typeof item.id !== 'string' || !/^[A-Za-z0-9._:/-]{1,120}$/.test(item.id)) return [];
    const efforts = Array.isArray(item.supported_reasoning_efforts) ? item.supported_reasoning_efforts.filter(
      (value): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{1,30}$/.test(value)) : [];
    return [{ id: item.id, label: typeof item.display_name === 'string' ? item.display_name.slice(0,150) : typeof item.name === 'string' ? item.name.slice(0, 150) : item.id, efforts, defaultEffort: '' }];
  });
}
function textBlocks(value: unknown, type: string): string {
  return Array.isArray(value) ? value.filter(item => item?.type === type && typeof item.text === 'string')
    .map(item => item.text).join('\n') : '';
}

export function createCompatibleService(credential: Credential, provider: ApiProvider = 'compatible') {
  let saved: Connection | undefined;
  let busy = false;
  const shutdown = new AbortController();
  const status = () => ({ connected: !!saved, endpoint: saved?.endpoint ?? '' });
  return {
    status,
    async restore() {
      const text = await credential.read();
      if (text && !saved) {
        const value = JSON.parse(text) as Connection;
        saved = { provider, endpoint: provider === 'compatible' ? normalize(value.endpoint) : apiEndpoints[provider], key: value.key };
      }
    },
    async connect(value: unknown) {
      if (!value || typeof value !== 'object' || !('endpoint' in value) || !('key' in value) ||
        typeof value.key !== 'string' || /[\x00-\x20]/.test(value.key) || value.key.length > 400) throw new Error('Check the endpoint and API key.');
      if (busy) throw new Error('Wait for the current API request.');
      busy = true;
      try {
        if (provider !== 'compatible' && !value.key) throw new Error('Enter an API key.');
        const next = { provider, endpoint: provider === 'compatible' ? normalize(value.endpoint) : apiEndpoints[provider], key: value.key };
        const models = await modelList(next, AbortSignal.any([shutdown.signal, AbortSignal.timeout(15000)]));
        if (!models.length) throw new Error('No supported models were listed.');
        await credential.write(JSON.stringify(next));
        saved = next;
        return status();
      } finally { busy = false; }
    },
    async models(signal: AbortSignal) {
      if (!saved) throw new Error('Connect the API first.');
      return modelList(saved, AbortSignal.any([signal, shutdown.signal, AbortSignal.timeout(15000)]));
    },
    async respond(selection: AiModelSelection, prompt: string, signal: AbortSignal) {
      const connection = saved;
      if (!connection || busy) throw new Error('The API is disconnected or busy.');
      busy = true;
      try {
        const combined = AbortSignal.any([signal, shutdown.signal, AbortSignal.timeout(180000)]);
        if (!supportsSelection(await modelList(connection, combined), selection)) throw new Error('This model or effort is unavailable.');
        const messages = [{ role: 'user', content: prompt }];
        let output: unknown;
        if (provider === 'claude') {
          const result = await call(connection, '/messages', combined, { model: selection.model, max_tokens: 8192, messages });
          output = textBlocks(result.content, 'text');
        } else if (provider === 'openai') {
          const result = await call(connection, '/responses', combined, { model: selection.model, input: prompt, store: false });
          output = Array.isArray(result.output) ? result.output.filter(item => item?.type === 'message')
            .map(item => textBlocks(item.content, 'output_text')).join('\n') : undefined;
        } else {
          const result = await call(connection, '/chat/completions', combined, { model: selection.model, stream: false,
            ...(selection.effort ? { reasoning_effort: selection.effort } : {}), messages });
          output = Array.isArray(result.choices) ? result.choices[0]?.message?.content : undefined;
        }
        if (typeof output !== 'string' || !output.trim() || output.length > 64000) throw new Error('The model returned no usable text.');
        return output;
      } finally { busy = false; }
    },
    close() { shutdown.abort(); },
  };
}
export type CompatibleService = ReturnType<typeof createCompatibleService>;
