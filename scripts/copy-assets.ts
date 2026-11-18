import { copyFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { writeBuildInfo } from './write-build-info.ts';

for (const path of ['today/index.html', 'today/style.css', 'projects/style.css']) {
  const destination = resolve('dist', 'public', path);
  await mkdir(resolve(destination, '..'), { recursive: true });
  await copyFile(resolve('public', path), destination);
}
// The interface font is served locally because the page policy allows only same-origin fonts.
await mkdir(resolve('dist', 'public', 'today', 'fonts'), { recursive: true });
for (const file of ['inter-latin-wght-normal.woff2', 'inter-latin-ext-wght-normal.woff2']) {
  await copyFile(resolve('node_modules', '@fontsource-variable', 'inter', 'files', file), resolve('dist', 'public', 'today', 'fonts', file));
}
await writeBuildInfo();
