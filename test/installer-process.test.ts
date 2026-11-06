import test from 'node:test';
import assert from 'node:assert/strict';
import { runInstallerProcess } from '../scripts/installer-process.ts';

test('installer lifetime observes parent exit without capturing private process output', async () => {
  const result = await runInstallerProcess(process.execPath,
    ['-e', "console.log('private output'); process.stderr.write('private error'); process.exit(0)"], process.env, 5000);
  assert.equal(result.exited, true);
  assert.equal(result.code, 0);
  assert.equal(result.timedOut, false);
  assert.equal(JSON.stringify(result).includes('private'), false);
});

test('missing installer fails with a small result instead of raw command details', async () => {
  const result = await runInstallerProcess('focusflow-missing-installer-fixture', [], process.env, 5000);
  assert.equal(result.spawnFailed, true);
  assert.equal(result.code, null);
  assert.equal(result.pid, null);
});

test('an installer timeout stops its owned process and stays a failure', async () => {
  const result = await runInstallerProcess(process.execPath,
    ['-e', 'setInterval(() => {}, 1000)'], process.env, 300);
  assert.equal(result.timedOut, true);
  assert.equal(result.exited, true);
  assert.notEqual(result.code, 0);
});
