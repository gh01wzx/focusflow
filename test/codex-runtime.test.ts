import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CODEX_VERSION } from '../src/shared/ai.ts';
import { resolveCodexCommand } from '../src/codex/runtime.ts';
import { createAiRuntime } from '../src/ai/runtime.ts';

test('Windows resolves the pinned native process and refuses missing or mismatched packages', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'focusflow-codex-runtime-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const runtime = join(directory, 'FocusFlow', 'codex-product', 'runtime');
  const packages = join(runtime, 'node_modules', '@openai');
  const root = join(packages, 'codex');
  await mkdir(join(root, 'bin'), { recursive: true });
  await writeFile(join(root, 'package.json'), JSON.stringify({ version: CODEX_VERSION }));
  await writeFile(join(root, 'bin', 'codex.js'), 'throw new Error("Must not launch the Windows wrapper");');
  const resolveWindows = (path: string) => resolveCodexCommand(path, 'win32', 'x64');
  const product = createAiRuntime(directory, true, join(directory, 'review'), resolveWindows);
  assert.equal(await product.installed(), false, 'The JS package alone is not an installed Windows runtime.');
  await assert.rejects(resolveWindows(runtime));
  for (const [architecture, target] of [['x64', 'x86_64-pc-windows-msvc'], ['arm64', 'aarch64-pc-windows-msvc']] as const) {
    const native = join(packages, `codex-win32-${architecture}`);
    const bin = join(native, 'vendor', target, 'bin');
    await mkdir(bin, { recursive: true });
    await writeFile(join(native, 'package.json'), JSON.stringify({ version: `${CODEX_VERSION}-win32-${architecture}` }));
    await assert.rejects(resolveCodexCommand(runtime, 'win32', architecture), 'Missing executable must not fall back to the JS wrapper.');
    const executable = join(bin, 'codex.exe');
    await writeFile(executable, 'Disposable resolver fixture; never executed.');
    const command = await resolveCodexCommand(runtime, 'win32', architecture);
    assert.equal(command.executable, executable);
    assert.deepEqual(command.args, []);
    assert.equal(command.environment.CODEX_MANAGED_BY_NPM, '1');
    assert.ok(command.environment.CODEX_MANAGED_PACKAGE_ROOT);
    if (architecture === 'x64') assert.equal(await product.installed(), true);
    await writeFile(join(native, 'package.json'), JSON.stringify({ version: '0.0.0' }));
    await assert.rejects(resolveCodexCommand(runtime, 'win32', architecture));
  }
  assert.equal(await product.installed(), false);
  await assert.rejects(resolveCodexCommand(runtime, 'win32', 'ia32'));
  await writeFile(join(root, 'package.json'), JSON.stringify({ version: '0.0.0' }));
  await assert.rejects(resolveCodexCommand(runtime, 'linux', 'x64'));
});
