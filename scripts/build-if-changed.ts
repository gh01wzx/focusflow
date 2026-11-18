import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeBuildInfo } from './write-build-info.ts';

// The platform launchers call this instead of a full build. A full build type-checks and compiles
// everything again, which costs several seconds on every launch even when nothing changed.
process.chdir(fileURLToPath(new URL('..', import.meta.url)));

// Everything the build reads. npm rewrites node_modules/.package-lock.json whenever it changes the
// installed dependencies.
const inputs = ['src', 'public', 'scripts', 'test', 'package.json', 'package-lock.json', 'tsconfig.json',
  'tsconfig.base.json', 'tsconfig.browser.json', 'tsconfig.desktop.json', 'node_modules/.package-lock.json'];
// A hash of those inputs, saved after a successful build. Each build first removes the whole dist
// directory, so a failed or interrupted build leaves no record and the next launch builds again.
const record = join('dist', 'build-inputs.sha256');

async function hashInputs(): Promise<string> {
  const files: string[] = [];
  for (const input of inputs) {
    const info = await stat(input).catch(() => null);
    if (info?.isFile()) files.push(input);
    else if (info?.isDirectory()) {
      for (const entry of await readdir(input, { recursive: true, withFileTypes: true })) {
        if (entry.isFile()) files.push(join(entry.parentPath, entry.name));
      }
    }
  }
  const lines = await Promise.all(files.map(path => path.replaceAll('\\', '/')).sort().map(async path =>
    path + ' ' + createHash('sha256').update(await readFile(path)).digest('hex')));
  return createHash('sha256').update(lines.join('\n')).digest('hex');
}

const current = await hashInputs();
if ((await readFile(record, 'utf8').catch(() => '')).trim() === current) {
  // The compiled app already matches the source. Only the Git details shown in the app can be newer.
  await writeBuildInfo();
  console.log('The FocusFlow build matches the source. Skipping the rebuild.');
} else {
  const build = spawnSync('npm run build', { stdio: 'inherit', shell: true });
  // Saves the hash taken before building, so a change made during the build is built next time.
  if (build.status === 0) await writeFile(record, current + '\n');
  else process.exitCode = build.status || 1;
}
