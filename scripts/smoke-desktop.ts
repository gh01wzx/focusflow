import { _electron as electron } from 'playwright-core';
import type { ElectronApplication } from 'playwright-core';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';

const executableArgument = process.argv[2];
if (!executableArgument) throw new Error('Provide the installed desktop executable path.');
const executable = resolve(executableArgument);
const profile = await mkdtemp(join(tmpdir(), 'focusflow-desktop-smoke-'));
assert.ok(!profile.startsWith(dirname(executable)), 'Test data must be outside the installation directory.');
const artifacts = resolve('artifacts', 'desktop');
await mkdir(artifacts, { recursive: true });
const environment = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
delete environment.ELECTRON_RUN_AS_NODE;
environment.FOCUSFLOW_DESKTOP_TEST_DATA_DIR = profile;
const expected = 'Desktop persistence verified.';
let application: ElectronApplication | undefined;

try {
  application = await electron.launch({ executablePath: executable, env: environment, timeout: 30000 });
  const page = await application.firstWindow();
  await page.getByRole('status').filter({ hasText: 'Local data loaded.' }).waitFor();
  assert.equal(await application.evaluate(({ app }) => app.getPath('userData')), profile);
  assert.deepEqual(await page.evaluate('({ requireType: typeof require, processType: typeof process })'), {
    requireType: 'undefined', processType: 'undefined',
  });
  await page.getByLabel('Test text').fill(expected);
  await page.getByRole('button', { name: 'Save locally', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Saved locally.' }).waitFor();
  await page.getByRole('button', { name: 'Create backup', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Backup created from your last save and verified:' }).waitFor();
  await page.screenshot({ path: join(artifacts, 'desktop-smoke.png'), fullPage: true });
  const versions = await application.evaluate(() => ({
    electron: process.versions.electron,
    node: process.versions.node,
    sqlite: process.versions.sqlite,
  }));
  await promisify(execFile)(executable, [], { env: environment, timeout: 20000, windowsHide: true });
  assert.equal(await page.getByLabel('Test text').inputValue(), expected);
  await application.close();
  application = undefined;

  application = await electron.launch({ executablePath: executable, env: environment, timeout: 30000 });
  const reopened = await application.firstWindow();
  await reopened.getByRole('status').filter({ hasText: 'Local data loaded.' }).waitFor();
  assert.equal(await reopened.getByLabel('Test text').inputValue(), expected);
  assert.ok((await stat(join(profile, 'data', 'phase0.db'))).isFile());
  await application.close();
  application = undefined;
  const report = {
    executable: basename(executable), versions,
    rendererNodeAccess: false, backupVerified: true, persistedAfterRelaunch: true,
    secondInstanceExited: true, dataOutsideInstallation: true,
    scope: 'Installed unsigned Phase 0 experiment; no updater or authenticated integrations.',
  };
  await writeFile(join(artifacts, 'desktop-smoke.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
} finally {
  if (application) await application.close();
  if (dirname(resolve(profile)) !== resolve(tmpdir()) || !basename(profile).startsWith('focusflow-desktop-smoke-')) {
    throw new Error('Refusing cleanup outside the disposable smoke profile.');
  }
  await rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
}
