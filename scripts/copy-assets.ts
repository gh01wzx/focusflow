import { copyFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const destination = resolve('dist', 'public', 'today');
await mkdir(destination, { recursive: true });
for (const name of ['index.html', 'style.css']) {
  await copyFile(resolve('public', 'today', name), resolve(destination, name));
}
