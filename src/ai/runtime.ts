import { readFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { CODEX_VERSION } from '../shared/ai.ts';
import { withCodexProcess } from '../codex/process.ts';
import type { AiRuntime } from './service.ts';

export function createAiRuntime(localDataDirectory: string, electron = false, selectedProfileDirectory?: string): AiRuntime {
  const root = join(localDataDirectory, 'FocusFlow', 'codex-product');
  const profile = selectedProfileDirectory ? join(selectedProfileDirectory, 'codex-profile') : join(root, 'profile');
  const runtime = join(root, 'runtime');
  const cli = join(runtime, 'node_modules', '@openai', 'codex', 'bin', 'codex.js');
  return {
    async installed() {
      try {
        const value: unknown = JSON.parse(await readFile(join(runtime, 'node_modules', '@openai', 'codex', 'package.json'), 'utf8'));
        return typeof value === 'object' && value !== null && 'version' in value && value.version === CODEX_VERSION;
      } catch { return false; }
    },
    async run(operation) {
      await mkdir(profile, { recursive: true, mode: 0o700 });
      const environment: NodeJS.ProcessEnv = {};
      for (const key of ['PATH', 'Path', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH', 'LOCALAPPDATA', 'APPDATA']) {
        if (process.env[key]) environment[key] = process.env[key];
      }
      environment.CODEX_HOME = profile;
      if (electron) environment.ELECTRON_RUN_AS_NODE = '1';
      const result = await withCodexProcess(process.execPath,
        [cli, '-c', 'cli_auth_credentials_store="keyring"', 'app-server', '--listen', 'stdio://'], environment, operation);
      return result.result;
    },
  };
}
