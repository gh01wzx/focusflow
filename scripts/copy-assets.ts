import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

for (const path of ['today/index.html', 'today/style.css', 'projects/style.css']) {
  const destination = resolve('dist', 'public', path);
  await mkdir(resolve(destination, '..'), { recursive: true });
  await copyFile(resolve('public', path), destination);
}
const version: unknown = JSON.parse(await readFile('package.json', 'utf8'));
function revision(ref: string) {
  try {
    const value = execFileSync('git', ['rev-parse', ref], { encoding: 'utf8', windowsHide: true, timeout: 3000, stdio: ['ignore','pipe','ignore'] }).trim();
    return /^[a-f0-9]{40}$/.test(value) ? value : 'unknown';
  } catch { return 'unknown'; }
}
let dirty = true;
try { dirty = !!execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8', windowsHide: true, timeout: 3000, stdio: ['ignore','pipe','ignore'] }).trim(); } catch {}
await mkdir(resolve('dist/src/runtime'), { recursive: true });
await writeFile(resolve('dist/src/runtime/build-info.json'), JSON.stringify({
  version: version && typeof version === 'object' && 'version' in version ? version.version : 'unknown',
  commit: revision('HEAD'), tree: revision('HEAD^{tree}'), dirty,
}) + '\n');
