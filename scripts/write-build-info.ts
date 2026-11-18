import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

function git(...args: string[]): string {
  return execFileSync('git', args, { encoding: 'utf8', windowsHide: true, timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
}

function revision(ref: string): string {
  try {
    const value = git('rev-parse', ref);
    return /^[a-f0-9]{40}$/.test(value) ? value : 'unknown';
  } catch { return 'unknown'; }
}

// Records the version and source revision that the app reports, so each observed result names its build.
export async function writeBuildInfo(): Promise<void> {
  const version: unknown = JSON.parse(await readFile('package.json', 'utf8'));
  let dirty = true;
  try { dirty = !!git('status', '--porcelain'); } catch {}
  await mkdir(resolve('dist/src/runtime'), { recursive: true });
  await writeFile(resolve('dist/src/runtime/build-info.json'), JSON.stringify({
    version: version && typeof version === 'object' && 'version' in version ? version.version : 'unknown',
    commit: revision('HEAD'), tree: revision('HEAD^{tree}'), dirty,
  }) + '\n');
}
