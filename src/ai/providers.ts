import { CodexFailure } from '../codex/client.ts';
import { ProbeFailure, readOnlyResponse } from '../codex/read-only-probe.ts';
import { aiProviderNames, supportsSelection } from '../shared/ai.ts';
import type { ApiProvider, AiConnection, AiModel, AiModelSelection, AiProvider } from '../shared/ai.ts';
import type { CompatibleService } from './compatible.ts';
import type { DshService } from './dsh.ts';
import { readCodexModels } from './models.ts';
import type { AiService } from './service.ts';

export class AiProviderError extends Error {}
type ResponseProgress = 'waiting' | 'responding' | 'retrying';

export function createAiProviders(codex: AiService, dsh?: DshService, respond = readOnlyResponse, compatible?: CompatibleService, named: Partial<Record<ApiProvider, CompatibleService>> = {}) {
  const api = { ...named, compatible };
  const isConnected = (provider: AiProvider) =>
    provider === 'codex' ? codex.status().mode === 'chatgpt' : provider === 'dsh' ? dsh?.status().ready === true : api[provider]?.status().connected === true;
  function requireConnection(provider: AiProvider) {
    if (!isConnected(provider)) throw new AiProviderError(`Connect ${aiProviderNames[provider]} in AI connection first.`);
  }
  return {
    isConnected,
    connections(): AiConnection[] {
      return Object.keys(aiProviderNames).map(key => {
        const provider = key as AiProvider;
        return { provider, connected: isConnected(provider) };
      });
    },
    async models(provider: AiProvider, signal: AbortSignal) {
      requireConnection(provider);
      if (provider === 'dsh' && dsh) return dsh.models(signal);
      if (provider !== 'codex' && provider !== 'dsh') return api[provider]!.models(signal);
      try {
        return await codex.runWithChatGPT((client, _cwd, combined, verify) => readCodexModels(client, combined, verify), signal, true);
      } catch (error) {
        if (error instanceof CodexFailure && error.code === 'AUTH_REQUIRED') {
          throw new AiProviderError('Reconnect Codex in AI connection first.');
        }
        if (error instanceof ProbeFailure && error.code === 'BUSY') {
          throw new AiProviderError('Wait for the current Codex request to finish, then refresh models.');
        }
        throw new AiProviderError('Could not load Codex models. Check the connection and try again.');
      }
    },
    async respond(selection: AiModelSelection, prompt: string, signal: AbortSignal, progress: (value: ResponseProgress) => void) {
      requireConnection(selection.provider);
      if (selection.provider === 'dsh' && dsh) {
        progress('waiting');
        return dsh.respond(selection, prompt, signal, () => progress('responding'));
      }
      if (selection.provider !== 'codex' && selection.provider !== 'dsh') {
        progress('waiting');
        return api[selection.provider]!.respond(selection, prompt, signal);
      }
      return codex.runWithChatGPT(async (client, cwd, combined, verify) => {
        let models: AiModel[];
        try { models = await readCodexModels(client, combined, verify); }
        catch { throw new AiProviderError('Could not refresh Codex models. Check the connection and try again.'); }
        const selected = selection.model ? selection : { ...selection, model: models[0]?.id ?? '' };
        if (!supportsSelection(models, selected)) {
          throw new AiProviderError('Codex no longer lists this model or effort. Refresh the models and choose again.');
        }
        progress('waiting');
        return respond(client, cwd, prompt, { signal: combined,
          onProgress: kind => progress(kind === 'delta' ? 'responding' : kind === 'retrying' ? 'retrying' : 'waiting'),
          model: selected.model, effort: selected.effort });
      }, signal, true);
    },
  };
}

export type AiProviders = ReturnType<typeof createAiProviders>;
