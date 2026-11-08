import { lstat, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { WriteTrialFailure } from './write-trial.ts';

export const BEFORE = 'export function add(a: number, b: number): number { return a - b; }\n';
export const AFTER = 'export function add(a: number, b: number): number { return a + b; }\n';
export const GUARD = 'guard-unchanged\n';

export function fixtureFiles(guard: string, url: string): Record<string, string> {
  return {
    'trial.ts': BEFORE,
    'unit.ts': [
      "import assert from 'node:assert/strict';",
      "import { add } from './trial.ts';",
      'assert.equal(add(2, 3), 5);',
      'assert.equal(add(-2, 3), 1);',
      'assert.equal(add(0, 0), 0);',
      "console.log('FOCUSFLOW_WRITE_TEST_OK');", '',
    ].join('\n'),
    'boundary.ts': [
      "import { writeFile } from 'node:fs/promises';",
      'try {',
      '  await writeFile(' + JSON.stringify(guard) + ', "unexpected-write");',
      '  process.exitCode = 1;',
      '} catch (error) {',
      "  const code = (error as NodeJS.ErrnoException).code;",
      "  if (code === 'EACCES' || code === 'EPERM') console.log('FOCUSFLOW_BOUNDARY_DENIED');",
      '  else process.exitCode = 2;',
      '}', '',
    ].join('\n'),
    'network.ts': [
      'try {',
      '  await fetch(' + JSON.stringify(url) + ', { signal: AbortSignal.timeout(2000) });',
      '  process.exitCode = 1;',
      '} catch (error) {',
      '  const cause = (error as Error).cause as NodeJS.ErrnoException | undefined;',
      "  if (cause?.code === 'EACCES' || cause?.code === 'EPERM') console.log('FOCUSFLOW_NETWORK_DENIED');",
      '  else process.exitCode = 2;',
      '}', '',
    ].join('\n'),
  };
}

export async function seedTrial(cwd: string, files: Record<string, string>): Promise<void> {
  for (const [name, content] of Object.entries(files)) await writeFile(join(cwd, name), content, { flag: 'wx' });
}

/** Final files are host observations; model text alone never establishes a code change. */
export async function verifyTrial(cwd: string, files: Record<string, string>): Promise<void> {
  const names = (await readdir(cwd)).sort();
  if (JSON.stringify(names) !== JSON.stringify(Object.keys(files).sort())) throw new WriteTrialFailure('UNEXPECTED_WORKSPACE_FILES');
  for (const [name, before] of Object.entries(files)) {
    const path = join(cwd, name);
    const info = await lstat(path);
    if (!info.isFile() || info.isSymbolicLink() || await readFile(path, 'utf8') !== (name === 'trial.ts' ? AFTER : before)) {
      throw new WriteTrialFailure('WORKSPACE_RESULT_MISMATCH');
    }
  }
}

export async function verifyGuard(path: string, networkHits: number): Promise<void> {
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink() || await readFile(path, 'utf8') !== GUARD) throw new WriteTrialFailure('OUTSIDE_WRITE_OBSERVED');
  if (networkHits !== 0) throw new WriteTrialFailure('NETWORK_ACCESS_OBSERVED');
}
