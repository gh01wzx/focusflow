import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { withCodexProcess } from '../codex/process.ts';
import { resolveCodexCommand } from '../codex/runtime.ts';
import type { AiRuntime } from './service.ts';

export function createAiRuntime(localDataDirectory: string, electron = false, selectedProfileDirectory?: string,
  resolveCommand = resolveCodexCommand): AiRuntime {
  const root = join(localDataDirectory, 'FocusFlow', 'codex-product');
  const profile = selectedProfileDirectory ? join(selectedProfileDirectory, 'codex-profile') : join(root, 'profile');
  const runtime = join(root, 'runtime');
  return {
    async installed() {
      try {
        await resolveCommand(runtime);
        return true;
      } catch { return false; }
    },
    async run(operation) {
      const command = await resolveCommand(runtime);
      await mkdir(profile, { recursive: true, mode: 0o700 });
      const environment: NodeJS.ProcessEnv = {};
      for (const key of ['PATH', 'Path', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH', 'LOCALAPPDATA', 'APPDATA']) {
        if (process.env[key]) environment[key] = process.env[key];
      }
      environment.CODEX_HOME = profile;
      Object.assign(environment, command.environment);
      if (electron && command.executable === process.execPath) environment.ELECTRON_RUN_AS_NODE = '1';
      const result = await withCodexProcess(command.executable,
        [...command.args, '-c', 'cli_auth_credentials_store="keyring"', 'app-server', '--listen', 'stdio://'], environment, operation);
      return result.result;
    },
  };
}
