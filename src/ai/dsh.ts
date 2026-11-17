import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, delimiter, dirname, isAbsolute, join, resolve } from 'node:path';
import { record } from '../codex/client.ts';
import { withCodexProcess } from '../codex/process.ts';
import { DSH_VERSION, supportsSelection } from '../shared/ai.ts';
import type { AiModelSelection, DshStatus } from '../shared/ai.ts';
import { DeepSeekAuthError, readDeepSeekMetadata, readDeepSeekModels } from './models.ts';

const marker = 'FOCUSFLOW_DSH_OK';
const disabledTools = ['tool-fs', 'tool-working-directory', 'persistent-bash', 'persistent-pwsh',
  'terminal-bash', 'terminal-pwsh', 'mcp-resources', 'deepseek-llm-api-extensions'];
const profilePatch = disabledTools.map(id => `- id: ${id}\n  disabled: true\n`).join('') +
  "- id: sandbox-policy\n  config:\n    mode: read-only\n    workspaceRoot: !!js process.cwd()\n";

export class DshFailure extends Error {}

async function locateDsh(): Promise<string> {
  const override = process.env.FOCUSFLOW_DSH_DIR;
  let directories: string[];
  if (override) directories = [override];
  else if (process.platform === 'win32') {
    directories = process.env.APPDATA ? [join(process.env.APPDATA, 'npm', 'node_modules', '@deepseek-ai', 'dsh')] : [];
  } else {
    // npm links global commands in PREFIX/bin and installs their packages in PREFIX/lib/node_modules.
    const bins = (process.env.PATH ?? '').split(delimiter).filter(path => isAbsolute(path) && basename(path) === 'bin');
    const prefixes = [process.env.npm_config_global_prefix ?? '', ...bins.map(path => dirname(path))].filter(isAbsolute);
    directories = [...new Set(prefixes)].map(prefix => join(prefix, 'lib', 'node_modules', '@deepseek-ai', 'dsh'));
  }
  for (const directory of directories) {
    if (!isAbsolute(directory)) continue;
    const bin = join(directory, 'lib', 'bin.js');
    try {
      const manifest = record(JSON.parse(await readFile(join(directory, 'package.json'), 'utf8')));
      if (manifest.name === '@deepseek-ai/dsh' && manifest.version === DSH_VERSION && (await stat(bin)).isFile()) return bin;
    } catch { /* Try the next npm prefix. */ }
  }
  throw new DshFailure(`Install @deepseek-ai/dsh@${DSH_VERSION} with npm, or set FOCUSFLOW_DSH_DIR to that package directory.`);
}

async function invoke(bin: string, key: string, selection: AiModelSelection, signal: AbortSignal,
  prompt?: string, onResponse?: () => void) {
  const root = await mkdtemp(join(tmpdir(), 'focusflow-dsh-'));
  try {
    const patch = join(root, 'readonly.patch.yml');
    await writeFile(patch, profilePatch, { flag: 'wx' });
    signal.throwIfAborted();
    const env: NodeJS.ProcessEnv = { DEEPSEEK_API_KEY: key, DSH_HOME: join(root, 'home'),
      DSH_TELEMETRY_DISABLED: '1', DSH_SYSTEM_PROMPT: 'Respond in text using only the supplied request.' };
    for (const name of ['PATH', 'Path', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'TMPDIR', 'HOME', 'USERPROFILE', 'LOCALAPPDATA', 'APPDATA']) {
      if (process.env[name]) env[name] = process.env[name];
    }
    if (process.versions.electron) env.ELECTRON_RUN_AS_NODE = '1';
    const result = await withCodexProcess(process.execPath,
      [bin, '--profile', 'focusflow-readonly', '--from-default-profile', 'sdk-minimal', '--patch', patch], env,
      async (client, cwd) => {
        const stop = () => client.close();
        signal.addEventListener('abort', stop, { once: true });
        try {
          signal.throwIfAborted();
          const hello = record(await client.initialize({ cwd, provider: 'deepseek-official', model: selection.model,
            ...(selection.effort ? { reasoningEffort: selection.effort } : {}), maxTokens: 24_000 }));
          if (record(hello.serverInfo).name !== 'deepseek-harness-sdk-runtime') throw new DshFailure('Unexpected DeepSeek Harness SDK response.');
          if (!prompt) return '';
          const sessionId = 'focusflow-' + randomUUID();
          let answer = '';
          let reason: unknown;
          let resolveTurn!: () => void;
          const turn = new Promise<void>(done => { resolveTurn = done; });
          const event = (method: string, raw: unknown) => {
            if (method !== 'session.event' || record(raw).sessionId !== sessionId) return;
            const item = record(record(raw).event);
            const data = record(item.data);
            if (item.type === 'assistant/message') {
              const content = record(data.message ?? data).content;
              if (Array.isArray(content)) {
                answer = content.map(record).filter(block => block.type === 'text' && typeof block.text === 'string')
                  .map(block => block.text as string).join('');
                onResponse?.();
              }
            }
            if (typeof item.type === 'string' && item.type.startsWith('tool/')) {
              reason = 'tool-requested';
              client.close();
              return;
            }
            if (item.type === 'turn/end') { reason = record(data.reason).kind; resolveTurn(); }
          };
          client.on('notification', event);
          client.once('closed', resolveTurn);
          try {
            const receipt = record(await client.request('session/prompt', { sessionId, contentBlocks: [{ type: 'text', text: prompt }] }));
            if (typeof receipt.messageId !== 'string' || !receipt.messageId) throw new DshFailure('DeepSeek Harness did not accept the prompt.');
            await turn;
            signal.throwIfAborted();
            if (reason !== 'completed' || !answer.trim() || answer.length > 64_000) {
              throw new DshFailure('DeepSeek Harness did not return a complete response.');
            }
            return answer;
          } finally {
            client.off('notification', event);
            client.off('closed', resolveTurn);
          }
        } finally { signal.removeEventListener('abort', stop); }
      }, { jsonRpc: true });
    return result.result;
  } finally {
    if (dirname(resolve(root)) === resolve(tmpdir()) && basename(root).startsWith('focusflow-dsh-')) {
      await rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  }
}

export function createDshService(credential?: { read(): Promise<string | undefined>; write(value: string): Promise<void> }) {
  let state: DshStatus = { ready: false, verified: false, message: 'Check the installed DeepSeek Harness CLI and DeepSeek API key.' };
  const shutdown = new AbortController();
  let active: Promise<unknown> | null = null;

  async function run<T>(signal: AbortSignal, operation: (key: string, signal: AbortSignal) => Promise<T>): Promise<T> {
    if (active) throw new DshFailure('Another DeepSeek Harness request is active.');
    const combined = AbortSignal.any([signal, shutdown.signal, AbortSignal.timeout(150_000)]);
    const key = (await credential?.read() ?? process.env.DEEPSEEK_API_KEY)?.trim();
    if (!key) {
      state = { ready: false, verified: false, message: 'Save your DeepSeek API key in AI connection.' };
      throw new DshFailure(state.message);
    }
    combined.throwIfAborted();
    const work = operation(key, combined);
    active = work;
    try { return await work; }
    catch (error) {
      if (error instanceof DshFailure) throw error;
      if (error instanceof DeepSeekAuthError) {
        state = { ready: false, verified: false, message: error.message };
        throw new DshFailure(error.message);
      }
      throw new DshFailure(combined.aborted ? 'DeepSeek Harness was cancelled or timed out.'
        : 'DeepSeek Harness did not complete. Check its SDK installation, API key and network.');
    } finally { active = null; }
  }

  function requireConnection() {
    if (!state.ready) throw new DshFailure('Connect DeepSeek Harness in AI connection first.');
  }

  async function check(verify: boolean) {
    if (active) return { ...state, message: 'Another DeepSeek Harness request is active.' };
    const previouslyVerified = state.verified;
    // A new check must finish before this connection can be used again.
    state = { ready: false, verified: false, message: 'Checking DeepSeek Harness.' };
    try {
      return await run(shutdown.signal, async (key, signal) => {
        const bin = await locateDsh();
        const balance = record(await readDeepSeekMetadata('user/balance', key, signal));
        if (typeof balance.is_available !== 'boolean') throw new DshFailure('Could not verify the DeepSeek API account.');
        const [model] = await readDeepSeekModels(key, signal);
        if (!model) throw new DshFailure('DeepSeek returned no text models.');
        const selection: AiModelSelection = { provider: 'dsh', model: model.id, effort: '' };
        const answer = await invoke(bin, key, selection, signal, verify ? `Reply with exactly ${marker}.` : undefined);
        if (verify && answer.trim() !== marker) throw new DshFailure('The DeepSeek model returned an unexpected reply.');
        state = { ready: true, verified: verify || previouslyVerified, message: verify
          ? 'Connected. One read-only response was verified.'
          : balance.is_available ? 'Connected. Your DeepSeek API key and Harness runtime were checked.'
            : 'Connected. DeepSeek reports insufficient balance for model requests.' };
        return state;
      });
    } catch (error) {
      state = { ready: false, verified: false, message: error instanceof DshFailure ? error.message : 'DeepSeek Harness is unavailable.' };
      return state;
    }
  }

  return {
    status: () => state,
    async restore() { if (await credential?.read() || process.env.DEEPSEEK_API_KEY?.trim()) await check(false); },
    async saveKey(value: unknown) {
      if (!credential || typeof value !== 'string' || !/^[A-Za-z0-9_-]{12,300}$/.test(value.trim())) throw new DshFailure('Enter a valid DeepSeek API key.');
      if (active) throw new DshFailure('Wait for the current DeepSeek request to finish.');
      try { await readDeepSeekModels(value.trim(), AbortSignal.timeout(15_000)); await credential.write(value.trim()); }
      catch { throw new DshFailure('Could not verify or securely save the DeepSeek key. Check your connection and key.'); }
      return check(false);
    },
    check: () => check(false),
    verify: (confirmed: unknown) => confirmed === true ? check(true)
      : Promise.resolve({ ...state, message: 'Confirm that this check uses your DeepSeek API balance.' }),
    models(signal: AbortSignal) {
      requireConnection();
      return run(signal, readDeepSeekModels);
    },
    respond(selection: AiModelSelection, prompt: string, signal: AbortSignal, onResponse: () => void) {
      requireConnection();
      return run(signal, async (key, combined) => {
        if (!supportsSelection(await readDeepSeekModels(key, combined), selection)) {
          throw new DshFailure('DeepSeek no longer lists this model or effort. Refresh the models and choose again.');
        }
        const bin = await locateDsh();
        return invoke(bin, key, selection, combined, prompt, onResponse);
      });
    },
    async close() { shutdown.abort(); await active?.catch(() => {}); },
  };
}

export type DshService = ReturnType<typeof createDshService>;
