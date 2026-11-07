import test from 'node:test';
import assert from 'node:assert/strict';
import { installerEnvironment, runInstallerProcess } from '../scripts/installer-process.ts';

test('installer keeps the hosted Windows profile without inheriting account credentials', () => {
  const source = { APPDATA: 'hosted-roaming', LOCALAPPDATA: 'hosted-local', USERPROFILE: 'hosted-user',
    USERNAME: 'runner', USERDOMAIN: 'hosted-machine', PSModulePath: 'hosted-modules', SystemRoot: 'hosted-windows',
    GITHUB_TOKEN: 'disposable-github-secret', OPENAI_API_KEY: 'disposable-model-secret', AWS_SECRET_ACCESS_KEY: 'disposable-cloud-secret' };
  const selected = installerEnvironment(source);
  assert.deepEqual(selected, { SystemRoot: source.SystemRoot, USERPROFILE: source.USERPROFILE,
    LOCALAPPDATA: source.LOCALAPPDATA, APPDATA: source.APPDATA, USERNAME: source.USERNAME,
    USERDOMAIN: source.USERDOMAIN, PSModulePath: source.PSModulePath });
  selected.APPDATA = 'separate-value';
  assert.equal(source.APPDATA, 'hosted-roaming', 'Selecting setup variables must not change the app environment.');
  assert.equal(JSON.stringify(selected).includes('secret'), false);
});

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
