import { mkdir, rm, stat } from 'node:fs/promises';
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
    async run(operation, freshModels = false) {
      const command = await resolveCommand(runtime);
      await mkdir(profile, { recursive: true, mode: 0o700 });
      // The pinned app-server has no force-refresh argument for model/list.
      // Its profile-owned cache is written only after a catalog request succeeds.
      const catalogCache = join(profile, 'models_cache.json');
      if (freshModels) await rm(catalogCache, { force: true });
      async function verifyFreshModels() {
        const info = await stat(catalogCache).catch(() => null);
        if (!info?.isFile()) throw new Error('Codex did not return a fresh account model catalog.');
      }
      const environment: NodeJS.ProcessEnv = {};
      for (const key of ['PATH', 'Path', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'TMPDIR', 'HOME', 'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH', 'LOCALAPPDATA', 'APPDATA']) {
        if (process.env[key]) environment[key] = process.env[key];
      }
      environment.CODEX_HOME = profile;
      Object.assign(environment, command.environment);
      if (electron && command.executable === process.execPath) environment.ELECTRON_RUN_AS_NODE = '1';
      const result = await withCodexProcess(command.executable,
        [...command.args, '-c', 'cli_auth_credentials_store="keyring"', 'app-server', '--listen', 'stdio://'], environment,
        (client, cwd) => operation(client, cwd, freshModels ? verifyFreshModels : undefined));
      return result.result;
    },
  };
}
