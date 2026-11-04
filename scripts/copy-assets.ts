import { copyFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

for (const path of ['today/index.html', 'today/style.css', 'projects/style.css']) {
  const destination = resolve('dist', 'public', path);
  await mkdir(resolve(destination, '..'), { recursive: true });
  await copyFile(resolve('public', path), destination);
}
