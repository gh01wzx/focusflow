import { readFile, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { checkArchitecture } from './architecture.ts';
import type { SourceModule } from './architecture.ts';

const modules: SourceModule[] = [];
async function collect(directory: string): Promise<void> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await collect(path);
    else if (/\.tsx?$/.test(entry.name)) {
      modules.push({ path: relative(process.cwd(), path).replaceAll('\\', '/'), content: await readFile(path, 'utf8') });
    }
  }
}
await collect(join(process.cwd(), 'src'));
await collect(join(process.cwd(), 'public'));
const errors = checkArchitecture(modules);
if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Architecture check passed for ${modules.length} modules.`);
}
