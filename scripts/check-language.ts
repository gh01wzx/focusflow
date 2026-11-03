import { readFile, readdir } from 'node:fs/promises';
import { extname, join } from 'node:path';

const sourceRoots = ['src', 'public', 'scripts', 'test', 'docs', '.github'];
const rootFiles = ['AGENTS.md', 'README.md', '.gitignore', 'package.json', 'package-lock.json', 'Start-FocusFlow.cmd', 'tsconfig.base.json', 'tsconfig.json', 'tsconfig.browser.json'];
const textExtensions = new Set(['.ts', '.md', '.html', '.css', '.json', '.yml', '.yaml', '.cmd', '.sql']);

async function sourceFiles(directory: string): Promise<string[]> {
  const result: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await sourceFiles(path));
    else if (entry.isFile() && textExtensions.has(extname(entry.name))) result.push(path);
  }
  return result;
}

const paths = [...rootFiles];
for (const root of sourceRoots) paths.push(...await sourceFiles(root));
const violations: string[] = [];
for (const path of paths) {
  const lines = (await readFile(path, 'utf8')).split(/\r?\n/);
  for (const [index, line] of lines.entries()) {
    if (/\p{Script=Han}/u.test(line)) violations.push(`${path}:${index + 1}`);
  }
}
if (violations.length) {
  console.error('Use English in maintained source and documentation. Escape non-English test fixtures.');
  console.error(violations.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Language check passed for ${paths.length} maintained files.`);
}
