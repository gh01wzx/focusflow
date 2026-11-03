import { _electron as electron } from 'playwright-core';
import type { ElectronApplication } from 'playwright-core';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { DatabaseSync } from 'node:sqlite';
import { restoreSnapshot, schemaVersion } from '../src/database/backup.ts';
import { SCHEMA_VERSION } from '../src/store.ts';

const installerA = process.argv[2];
const installerB = process.argv[3];
const baselineExecutable = process.argv[4];
assert.ok(installerA && installerB && baselineExecutable, 'Provide baseline/candidate installers and the packaged baseline executable.');
const manifest: unknown = JSON.parse(await readFile('package.json', 'utf8'));
assert.ok(typeof manifest === 'object' && manifest !== null && 'version' in manifest && typeof manifest.version === 'string');
const candidateVersion = manifest.version;
const root = await mkdtemp(join(tmpdir(), 'focusflow-upgrade-smoke-'));
const profile = join(root, 'profile');
const installation = join(root, 'installation');
const executable = join(installation, 'FocusFlow-Phase0.exe');
const artifacts = resolve('artifacts', 'upgrade');
await mkdir(artifacts, { recursive: true });
const environment = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
delete environment.ELECTRON_RUN_AS_NODE;
environment.FOCUSFLOW_DESKTOP_TEST_DATA_DIR = profile;
const originalNote = 'Saved in baseline A before the installer upgrade.';
const editedNote = 'Saved in candidate B after the installer upgrade.';
let application: ElectronApplication | undefined;

function quotePowerShell(value: string): string { return "'" + value.replaceAll("'", "''") + "'"; }
async function install(installer: string): Promise<void> {
  const command = `$process = Start-Process -FilePath ${quotePowerShell(resolve(installer))} -ArgumentList @('/S', ${quotePowerShell('/D=' + installation)}) -WindowStyle Hidden -Wait -PassThru; exit $process.ExitCode`;
  await promisify(execFile)('powershell.exe', ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', command], { windowsHide: true, timeout: 120000 });
}

function inspectDatabase(path: string): { version: number; note: unknown } {
  const db = new DatabaseSync(path, { readOnly: true });
  try { return { version: schemaVersion(db), note: db.prepare('SELECT body FROM probe_note WHERE id=1').get()?.body }; }
  finally { db.close(); }
}

try {
  await install(installerA);
  application = await electron.launch({ executablePath: executable, env: environment, timeout: 30000 });
  const first = await application.firstWindow();
  await first.getByRole('status').filter({ hasText: 'Local data loaded.' }).waitFor();
  assert.equal(await application.evaluate(({ app }) => app.getVersion()), '0.0.1');
  await first.getByLabel('Test text').fill(originalNote);
  await first.getByRole('button', { name: 'Save locally', exact: true }).click();
  await first.getByRole('status').filter({ hasText: 'Saved locally.' }).waitFor();
  await application.close();
  application = undefined;
  const databasePath = join(profile, 'data', 'phase0.db');
  assert.deepEqual(inspectDatabase(databasePath), { version: 1, note: originalNote });

  await install(installerB);
  application = await electron.launch({ executablePath: executable, env: environment, timeout: 30000 });
  const upgraded = await application.firstWindow();
  await upgraded.getByRole('status').filter({ hasText: 'Local data loaded.' }).waitFor();
  assert.equal(await application.evaluate(({ app }) => app.getVersion()), candidateVersion);
  assert.equal(await upgraded.getByLabel('Test text').inputValue(), originalNote);
  await upgraded.getByLabel('Test text').fill(editedNote);
  await upgraded.getByRole('button', { name: 'Save locally', exact: true }).click();
  await upgraded.getByRole('status').filter({ hasText: 'Saved locally.' }).waitFor();
  await upgraded.screenshot({ path: join(artifacts, 'upgraded-desktop.png'), fullPage: true });
  await application.close();
  application = undefined;
  assert.deepEqual(inspectDatabase(databasePath), { version: SCHEMA_VERSION, note: editedNote });

  const backupDirectory = join(profile, 'data', 'backups');
  const snapshots = (await readdir(backupDirectory)).filter(name => name.startsWith('before-migration-') && name.endsWith('.db'));
  assert.equal(snapshots.length, 1);
  const snapshotName = snapshots[0];
  assert.ok(snapshotName);
  const snapshot = join(backupDirectory, snapshotName);
  assert.deepEqual(inspectDatabase(snapshot), { version: 1, note: originalNote });
  const sourceBytes = await readFile(databasePath);
  const recoveredProfile = join(root, 'recovered-profile');
  const recoveredDatabase = join(recoveredProfile, 'data', 'phase0.db');
  await restoreSnapshot(snapshot, recoveredDatabase);
  assert.deepEqual(await readFile(databasePath), sourceBytes);
  environment.FOCUSFLOW_DESKTOP_TEST_DATA_DIR = recoveredProfile;
  application = await electron.launch({ executablePath: resolve(baselineExecutable), env: environment, timeout: 30000 });
  const recovered = await application.firstWindow();
  await recovered.getByRole('status').filter({ hasText: 'Local data loaded.' }).waitFor();
  assert.equal(await application.evaluate(({ app }) => app.getVersion()), '0.0.1');
  assert.equal(await recovered.getByLabel('Test text').inputValue(), originalNote);
  await application.close();
  application = undefined;
  const report = {
    baselineVersion: '0.0.1', candidateVersion, baselineSchema: 1, candidateSchema: SCHEMA_VERSION,
    sameInstallationPath: true, sameProfilePath: true, dataRetainedThroughInstallerUpgrade: true,
    preMigrationSnapshotSchema: 1, recoveredWithBaselineBinary: true, upgradedDatabasePreserved: true,
    scope: 'Manual unsigned installer upgrade and recovery into a separate profile; no automatic updater or binary rollback.',
  };
  await writeFile(join(artifacts, 'upgrade-smoke.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
} finally {
  if (application) await application.close();
  assert.equal(dirname(resolve(root)), resolve(tmpdir()));
  assert.ok(basename(root).startsWith('focusflow-upgrade-smoke-'));
  await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
}
