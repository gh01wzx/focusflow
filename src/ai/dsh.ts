import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { record } from '../codex/client.ts';
import { withCodexProcess } from '../codex/process.ts';
import { DSH_MODELS, DSH_VERSION, supportsSelection } from '../shared/planning-ai.ts';
import type { DshStatus, PlanningSelection } from '../shared/planning-ai.ts';

const marker = 'FOCUSFLOW_DSH_OK';
const checkSelection: PlanningSelection = { provider: 'dsh', model: DSH_MODELS[0]!.id, effort: 'off' };
const disabledTools = ['tool-fs', 'tool-working-directory', 'persistent-bash', 'persistent-pwsh',
  'terminal-bash', 'terminal-pwsh', 'mcp-resources', 'deepseek-llm-api-extensions'];
const profilePatch = disabledTools.map(id => `- id: ${id}\n  disabled: true\n`).join('') +
  "- id: sandbox-policy\n  config:\n    mode: read-only\n    workspaceRoot: !!js process.cwd()\n";

export class DshFailure extends Error {}

async function locateDsh(): Promise<string> {
  const override = process.env.FOCUSFLOW_DSH_DIR;
  const directory = override || (process.env.APPDATA ? join(process.env.APPDATA, 'npm', 'node_modules', '@deepseek-ai', 'dsh') : '');
  const installMessage = `Install @deepseek-ai/dsh@${DSH_VERSION} with npm, or set FOCUSFLOW_DSH_DIR to that package directory.`;
  if (!isAbsolute(directory)) throw new DshFailure(installMessage);
  const bin = join(directory, 'lib', 'bin.js');
  try {
    const manifest = record(JSON.parse(await readFile(join(directory, 'package.json'), 'utf8')));
    if (manifest.name === '@deepseek-ai/dsh' && manifest.version === DSH_VERSION && (await stat(bin)).isFile()) return bin;
  } catch { /* The same setup instruction covers absent and unreadable installations. */ }
  throw new DshFailure(installMessage);
}

export function createDshService() {
  let state: DshStatus = { ready: false, verified: false, message: 'Check the installed DeepSeek Harness CLI and DeepSeek API key.' };
  const shutdown = new AbortController();
  let active: Promise<string> | null = null;

  async function invoke(selection: PlanningSelection, signal: AbortSignal, prompt?: string, onResponse?: () => void) {
    if (!supportsSelection(DSH_MODELS, selection)) throw new DshFailure('Choose a supported DeepSeek Harness model and reasoning effort.');
    if (active) throw new DshFailure('Another DeepSeek Harness request is active.');
    const combined = AbortSignal.any([signal, shutdown.signal, AbortSignal.timeout(150_000)]);
    const operation = (async () => {
      const bin = await locateDsh();
      const key = process.env.DEEPSEEK_API_KEY?.trim();
      if (!key) throw new DshFailure('Set DEEPSEEK_API_KEY in the environment used to launch FocusFlow, then reopen it.');
      const root = await mkdtemp(join(tmpdir(), 'focusflow-dsh-'));
      try {
        const patch = join(root, 'planning.patch.yml');
        await writeFile(patch, profilePatch, { flag: 'wx' });
        combined.throwIfAborted();
        const env: NodeJS.ProcessEnv = { DEEPSEEK_API_KEY: key, DSH_HOME: join(root, 'home'),
          DSH_TELEMETRY_DISABLED: '1', DSH_SYSTEM_PROMPT: 'You are a text-only project planner. Use only the supplied goal.' };
        for (const name of ['PATH', 'Path', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'USERPROFILE', 'LOCALAPPDATA', 'APPDATA']) {
          if (process.env[name]) env[name] = process.env[name];
        }
        if (process.versions.electron) env.ELECTRON_RUN_AS_NODE = '1';
        const result = await withCodexProcess(process.execPath,
          [bin, '--profile', 'focusflow-planning', '--from-default-profile', 'sdk-minimal', '--patch', patch], env,
          async (client, cwd) => {
            const stop = () => client.close();
            combined.addEventListener('abort', stop, { once: true });
            try {
              combined.throwIfAborted();
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
                combined.throwIfAborted();
                if (reason !== 'completed' || !answer.trim() || answer.length > 64_000) {
                  throw new DshFailure('DeepSeek Harness did not return a complete response.');
                }
                return answer;
              } finally {
                client.off('notification', event);
                client.off('closed', resolveTurn);
              }
            } finally { combined.removeEventListener('abort', stop); }
          }, { jsonRpc: true });
        return result.result;
      } finally {
        if (dirname(resolve(root)) === resolve(tmpdir()) && basename(root).startsWith('focusflow-dsh-')) {
          await rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
        }
      }
    })();
    active = operation;
    try { return await operation; }
    catch (error) {
      if (error instanceof DshFailure) throw error;
      throw new DshFailure(combined.aborted ? 'DeepSeek Harness was cancelled or timed out.'
        : 'DeepSeek Harness did not complete. Check its SDK installation, API key and network.');
    } finally { active = null; }
  }

  async function check(verify: boolean) {
    if (active) return { ...state, message: 'Another DeepSeek Harness request is active.' };
    try {
      const answer = await invoke(checkSelection, shutdown.signal, verify ? `Reply with exactly ${marker}.` : undefined);
      if (verify && answer.trim() !== marker) throw new DshFailure('The DeepSeek model returned an unexpected reply.');
      state = { ready: true, verified: verify || state.verified, message: verify
        ? 'One read-only DeepSeek Harness model response was verified.'
        : 'DeepSeek Harness SDK initialized with a local API key. Run a read-only check to verify model access.' };
    } catch (error) {
      state = { ready: false, verified: false, message: error instanceof DshFailure ? error.message : 'DeepSeek Harness is unavailable.' };
    }
    return state;
  }

  return {
    status: () => state,
    check: () => check(false),
    verify: (confirmed: unknown) => confirmed === true ? check(true)
      : Promise.resolve({ ...state, message: 'Confirm that this check uses your DeepSeek API balance.' }),
    respond: (selection: PlanningSelection, prompt: string, signal: AbortSignal, onResponse: () => void) =>
      invoke(selection, signal, prompt, onResponse),
    async close() { shutdown.abort(); await active?.catch(() => {}); },
  };
}

export type DshService = ReturnType<typeof createDshService>;
