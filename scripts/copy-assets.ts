import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { SCHEMA_VERSION } from '../src/database/schema.ts';
import { resolve } from 'node:path';

for (const path of ['today/index.html', 'today/style.css', 'projects/style.css']) {
  const destination = resolve('dist', 'public', path);
  await mkdir(resolve(destination, '..'), { recursive: true });
  await copyFile(resolve('public', path), destination);
}

const pkg = JSON.parse(await readFile('package.json', 'utf8')) as { version: string };
const commit = await promisify(execFile)('git', ['rev-parse', 'HEAD'], { windowsHide: true })
  .then(result => result.stdout.trim()).catch(() => 'unknown');
const dirty = await promisify(execFile)('git', ['status', '--porcelain', '--untracked-files=no'], { windowsHide: true })
  .then(result => !!result.stdout.trim()).catch(() => true);
await mkdir(resolve('dist/src'), { recursive: true });
await writeFile(resolve('dist/src/build-info.json'), JSON.stringify({
  version: pkg.version, commit: /^[a-f0-9]{40}$/.test(commit) ? commit : 'unknown', schema: SCHEMA_VERSION, dirty,
}) + '\n');
