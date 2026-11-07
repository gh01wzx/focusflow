import { readFile, realpath, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { CODEX_VERSION } from '../shared/ai.ts';

export interface CodexCommand {
  executable: string;
  args: string[];
  environment: NodeJS.ProcessEnv;
}

export async function resolveCodexCommand(runtime: string, platform = process.platform, architecture = process.arch): Promise<CodexCommand> {
  const packages = join(runtime, 'node_modules', '@openai');
  const root = await realpath(join(packages, 'codex'));
  async function requireVersion(directory: string, version: string) {
    const value: unknown = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'));
    if (typeof value !== 'object' || value === null || !('version' in value) || value.version !== version) {
      throw new Error('Pinned Codex package version mismatch');
    }
  }
  await requireVersion(root, CODEX_VERSION);
  if (platform !== 'win32') {
    const cli = join(root, 'bin', 'codex.js');
    if (!(await stat(cli)).isFile()) throw new Error('Pinned Codex launcher missing');
    return { executable: process.execPath, args: [cli], environment: {} };
  }
  const target = architecture === 'x64' ? 'x86_64-pc-windows-msvc'
    : architecture === 'arm64' ? 'aarch64-pc-windows-msvc' : null;
  if (!target) throw new Error('Unsupported Codex Windows architecture');
  const native = join(packages, `codex-win32-${architecture}`);
  await requireVersion(native, `${CODEX_VERSION}-win32-${architecture}`);
  const executable = join(native, 'vendor', target, 'bin', 'codex.exe');
  if (!(await stat(executable)).isFile()) throw new Error('Pinned Codex executable missing');
  // The npm launcher spawns another Windows console without windowsHide.
  // Own the native process directly so hidden launch and cleanup cover it.
  return { executable, args: [], environment: { CODEX_MANAGED_PACKAGE_ROOT: root, CODEX_MANAGED_BY_NPM: '1' } };
}
