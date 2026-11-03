import { copyFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const destination = resolve('dist', 'public');
await mkdir(destination, { recursive: true });
for (const name of ['index.html', 'style.css']) {
  await copyFile(resolve('public', name), resolve(destination, name));
}
