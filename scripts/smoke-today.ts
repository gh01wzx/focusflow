import { _electron as electron } from 'playwright-core';
import type { ElectronApplication } from 'playwright-core';
import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { TASK_MIGRATIONS, TASK_SCHEMA_VERSION, TASK_APPLICATION_ID } from '../src/tasks/store.ts';
import { restoreSnapshot } from '../src/database/backup.ts';
import { localDay } from '../src/tasks/model.ts';
import type { TaskView } from '../src/tasks/model.ts';

const argument = process.argv[2];
assert.ok(argument, 'Provide the installed FocusFlow executable.');
const executable = resolve(argument);
const recovery = process.argv.includes('--recovery');
const root = await mkdtemp(join(tmpdir(), 'focusflow-today-smoke-'));
const profile = join(root, 'product');
const data = join(profile, 'data');
const artifacts = resolve('artifacts', recovery ? 'product-recovery' : 'today');
await mkdir(artifacts, { recursive: true });
const environment: Record<string, string> = {};
for (const key of ['PATH', 'Path', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH', 'LOCALAPPDATA', 'APPDATA', 'COMSPEC']) {
  const value = process.env[key];
  if (value) environment[key] = value;
}
environment.FOCUSFLOW_TEST_PROFILE = profile;
let application: ElectronApplication | undefined;
let stage = 'prepare';
const mark = (name: string) => { stage = name; console.log(`SMOKE_STAGE: ${name}`); };

async function closeApp() {
  if (!application) return;
  const owned = application; application = undefined;
  const child = owned.process();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const exited = child.exitCode !== null ? Promise.resolve(child.exitCode) : new Promise<number | null>(resolveExit => child.once('exit', code => resolveExit(code)));
    // Exercise the application's real quit path; a framework context-close acknowledgement is insufficient.
    void owned.evaluate(({ app }) => app.quit()).catch(() => {});
    const code = await Promise.race([exited, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('Owned desktop did not close within 15 seconds.')), 15_000);
    })]);
    assert.equal(code, 0, 'The desktop must exit gracefully.');
  } catch (error) {
    if (child.pid && child.exitCode === null) {
      if (process.platform === 'win32') {
        const killer = spawn(join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'taskkill.exe'),
          ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
        killer.on('error', () => child.kill('SIGKILL'));
      } else child.kill('SIGKILL');
    }
    throw error;
  } finally { if (timer) clearTimeout(timer); }
}
async function launch() {
  application = await electron.launch({ executablePath: executable, env: environment, timeout: 30_000 });
  const page = await application.firstWindow({ timeout: 15_000 });
  page.setDefaultTimeout(10_000);
  await page.getByRole('heading', { name: 'Today.', exact: true }).waitFor();
  await page.getByLabel('Task title').waitFor();
  await page.waitForFunction(() => !(document.getElementById('task-title') as HTMLInputElement).disabled);
  assert.deepEqual(await page.evaluate(() => ({ requireType: typeof (globalThis as Record<string, unknown>).require,
    processType: typeof (globalThis as Record<string, unknown>).process })), { requireType: 'undefined', processType: 'undefined' });
  assert.equal(await application.evaluate(({ app }) => app.getPath('userData')), profile);
  return page;
}

try {
  // A sentinel stands in for the separate spike profile; the product must never open it.
  const sentinel = join(root, 'phase0.db');
  const spike = new DatabaseSync(sentinel); spike.exec("CREATE TABLE probe_note(body); INSERT INTO probe_note VALUES('preserve spike');"); spike.close();
  const sentinelBytes = await readFile(sentinel);
  if (recovery) {
    await mkdir(data, { recursive: true });
    const db = new DatabaseSync(join(data, 'tracker.db'));
    db.exec(TASK_MIGRATIONS[0].sql); db.exec('PRAGMA user_version=1');
    db.prepare("INSERT INTO tasks VALUES('prior-product-task','Retained through product migration',?,'pending',?,NULL)")
      .run(localDay(new Date()), new Date().toISOString());
    db.close();
  }
  mark('launch-installed-product');
  let page = await launch();
  if (recovery) {
    await page.getByText('Retained through product migration', { exact: true }).waitFor();
    mark('close-after-product-migration'); await closeApp();
    const db = new DatabaseSync(join(data, 'tracker.db'), { readOnly: true });
    try {
      assert.equal(db.prepare('PRAGMA user_version').get()?.user_version, TASK_SCHEMA_VERSION);
      assert.equal(db.prepare('PRAGMA application_id').get()?.application_id, TASK_APPLICATION_ID);
    } finally { db.close(); }
    const snapshots = (await readdir(join(data, 'backups'))).filter(name => name.endsWith('.db'));
    assert.equal(snapshots.length, 1);
    const source = join(data, 'tracker.db'); const before = await readFile(source);
    const restored = join(root, 'recovered.db');
    await restoreSnapshot(join(data, 'backups', snapshots[0]!), restored);
    const reader = new DatabaseSync(restored, { readOnly: true });
    try {
      assert.equal(reader.prepare('PRAGMA user_version').get()?.user_version, 1);
      assert.equal(reader.prepare('SELECT title FROM tasks').get()?.title, 'Retained through product migration');
    } finally { reader.close(); }
    assert.deepEqual(await readFile(source), before);
    mark('relaunch-after-migration'); page = await launch();
    await page.getByText('Retained through product migration', { exact: true }).waitFor();
    await page.screenshot({ path: join(artifacts, 'product-recovery.png'), fullPage: true });
  } else {
    await page.getByRole('heading', { name: "You're clear for today" }).waitFor();
    const today = await page.getByLabel('Planned date').inputValue();
    const shift = (days: number) => { const date = new Date(today + 'T12:00:00'); date.setDate(date.getDate() + days); return localDay(date); };
    async function add(title: string, date = today) {
      await page.getByLabel('Task title').fill(title);
      await page.getByLabel('Planned date').fill(date);
      await page.getByRole('button', { name: 'Add task' }).click();
      await page.getByRole('status').filter({ hasText: 'Task added.' }).waitFor();
      await page.getByText(title, { exact: true }).waitFor();
    }
    mark('add-and-resolve-tasks');
    await add('Review the first Today workflow');
    await add('Finish a small task');
    await page.getByRole('checkbox', { name: 'Complete Finish a small task' }).click();
    await page.getByRole('status').filter({ hasText: 'Task completed.' }).waitFor();
    await add('An optional task');
    await page.getByRole('button', { name: 'Cancel An optional task' }).click();
    await page.getByRole('status').filter({ hasText: 'Task cancelled.' }).waitFor();
    await add('Follow up on yesterday', shift(-1));
    await page.getByText('Overdue', { exact: true }).waitFor();
    await add('Plan tomorrow', shift(1));
    await page.getByRole('heading', { name: 'Upcoming.', exact: true }).waitFor();
    await page.getByRole('button', { name: /Today/ }).click();
    assert.equal(await page.getByText('Plan tomorrow', { exact: true }).count(), 0);
    await page.screenshot({ path: join(artifacts, 'today.png'), fullPage: true });
    await add('\u4fdd\u7559\u539f\u6587 <img src=x onerror=alert(1)>');
    assert.equal(await page.locator('img').count(), 0);
    await page.getByRole('button', { name: /History/ }).click();
    await page.getByText('Finish a small task', { exact: true }).waitFor();
    await page.getByText('An optional task', { exact: true }).waitFor();
    mark('second-instance');
    await promisify(execFile)(executable, [], { env: environment, timeout: 20_000, windowsHide: true });
    mark('close-and-relaunch'); await closeApp(); page = await launch();
    await page.getByText('Review the first Today workflow', { exact: true }).waitFor();
    const view = await page.evaluate(async () => (await fetch('/api/tasks')).json()) as TaskView;
    assert.equal(view.due.length, 3); assert.equal(view.upcoming.length, 1); assert.equal(view.history.length, 2);
  }
  mark('final-close'); await closeApp();
  assert.deepEqual(await readFile(join(root, 'phase0.db')), sentinelBytes);
  assert.ok(!resolve(profile).startsWith(dirname(executable)), 'Product data is outside installation output.');
  await writeFile(join(artifacts, 'report.json'), JSON.stringify({ status: 'verified',
    scope: recovery ? 'Synthetic prior product schema migration and separate snapshot recovery; no historic product release is claimed.'
      : 'Installed Today add/complete/cancel, date filtering, Unicode/XSS display, second instance and restart persistence.',
    productDataSeparate: true, spikeUnchanged: true, rendererNodeAccess: false }, null, 2));
  console.log('TODAY_SMOKE_VERIFIED');
} catch (error) {
  await writeFile(join(artifacts, 'failure.json'), JSON.stringify({ stage, message: error instanceof Error ? error.message : 'Smoke failed' }));
  throw error;
} finally {
  await closeApp();
  assert.equal(dirname(resolve(root)), resolve(tmpdir()));
  assert.ok(basename(root).startsWith('focusflow-today-smoke-'));
  await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
