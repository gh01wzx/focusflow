import { constants } from 'node:fs';
import { access, readFile, realpath, stat } from 'node:fs/promises';
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
  if (platform !== 'win32' && platform !== 'darwin') {
    const cli = join(root, 'bin', 'codex.js');
    if (!(await stat(cli)).isFile()) throw new Error('Pinned Codex launcher missing');
    return { executable: process.execPath, args: [cli], environment: {} };
  }
  if (architecture !== 'x64' && architecture !== 'arm64') throw new Error('Unsupported Codex architecture');
  const processor = architecture === 'x64' ? 'x86_64' : 'aarch64';
  const target = processor + (platform === 'darwin' ? '-apple-darwin' : '-pc-windows-msvc');
  const variant = `${platform}-${architecture}`;
  const native = join(packages, 'codex-' + variant);
  await requireVersion(native, CODEX_VERSION + '-' + variant);
  const executable = join(native, 'vendor', target, 'bin', platform === 'darwin' ? 'codex' : 'codex.exe');
  if (!(await stat(executable)).isFile()) throw new Error('Pinned Codex executable missing');
  if (platform === 'darwin') await access(executable, constants.X_OK);
  // Launch the process we own directly, including when the parent is Electron.
  return { executable, args: [], environment: { CODEX_MANAGED_PACKAGE_ROOT: root, CODEX_MANAGED_BY_NPM: '1' } };
}
