import { rm } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const project = resolve(fileURLToPath(new URL('..', import.meta.url)));
const output = resolve(project, 'dist');
const cwd = resolve(process.cwd());
const inProject = process.platform === 'win32' ? project.toLowerCase() === cwd.toLowerCase() : project === cwd;
if (!inProject || dirname(output) !== project || basename(output) !== 'dist') {
  throw new Error('Refusing to clean outside the project build directory.');
}
await rm(output, { recursive: true, force: true });
