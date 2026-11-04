import { _electron as electron } from 'playwright-core';
import type { ElectronApplication } from 'playwright-core';
import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { TASK_MIGRATIONS, TASK_SCHEMA_VERSION, TASK_APPLICATION_ID } from '../src/tasks/schema.ts';
import { restoreSnapshot } from '../src/database/backup.ts';
import { localDay } from '../src/shared/calendar.ts';
import type { TaskView } from '../src/shared/tasks.ts';

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
    for (const migration of TASK_MIGRATIONS.slice(0, 2)) db.exec(migration.sql);
    db.exec('PRAGMA user_version=2');
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
      assert.equal(reader.prepare('PRAGMA user_version').get()?.user_version, 2);
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
    async function add(title: string, date = today, frequency = 'none') {
      await page.getByLabel('Task title').fill(title);
      await page.getByLabel('Repeat', { exact: true }).selectOption(frequency);
      await page.getByLabel('Planned date').fill(date);
      await page.getByRole('button', { name: 'Add task' }).click();
      await page.getByRole('status').filter({ hasText: 'Task added.' }).waitFor();
      await page.getByText(title, { exact: true }).waitFor();
    }
    mark('save-failure-keeps-input');
    await page.route('**/api/tasks', async route => {
      if (route.request().method() !== 'POST') return route.continue();
      await route.fulfill({ status: 500, contentType: 'application/json',
        body: JSON.stringify({ error: 'Could not save local data. Check disk space and try again.' }) });
    });
    await page.getByLabel('Task title').fill('Review the first Today workflow');
    await page.getByRole('button', { name: 'Add task' }).click();
    await page.getByRole('alert').filter({ hasText: 'Could not save local data.' }).waitFor();
    assert.equal(await page.getByLabel('Task title').inputValue(), 'Review the first Today workflow');
    await page.unroute('**/api/tasks');
    await page.getByRole('button', { name: 'Retry', exact: true }).click();
    await page.getByRole('alert').waitFor({ state: 'hidden' });
    assert.equal(await page.getByLabel('Task title').inputValue(), 'Review the first Today workflow');
    await add('Review the first Today workflow');
    await add('Finish a small task');
    mark('stale-read-cannot-undo-completion');
    const beforeCompletion = await page.evaluate(async () => (await fetch('/api/tasks')).json()) as TaskView;
    let releaseRead = () => {};
    let signalRead = () => {};
    const readStarted = new Promise<void>(resolveRead => { signalRead = resolveRead; });
    const readReleased = new Promise<void>(resolveRead => { releaseRead = resolveRead; });
    await page.route('**/api/tasks', async route => {
      if (route.request().method() !== 'GET') return route.continue();
      signalRead();
      await readReleased;
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify(beforeCompletion) });
    });
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    try {
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      await Promise.race([readStarted, new Promise<never>((_, reject) => {
        refreshTimer = setTimeout(() => reject(new Error('Refresh did not start.')), 10_000);
      })]);
      const staleResponse = page.waitForResponse(response => response.url().endsWith('/api/tasks')
        && response.request().method() === 'GET');
      await page.getByRole('checkbox', { name: 'Complete Finish a small task' }).click();
      await page.getByRole('status').filter({ hasText: 'Task completed.' }).waitFor();
      releaseRead();
      await (await staleResponse).finished();
      await page.evaluate(() => new Promise<void>(resolveFrame => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolveFrame()));
      }));
      assert.equal(await page.getByRole('checkbox', { name: 'Complete Finish a small task' }).count(), 0);
    } finally {
      if (refreshTimer) clearTimeout(refreshTimer);
      releaseRead();
      await page.unroute('**/api/tasks');
    }
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
    mark('repeating-task-controls');
    await add('Daily check-in', today, 'daily');
    await page.getByRole('checkbox', { name: 'Complete Daily check-in', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'Task completed.' }).waitFor();
    await add('Weekly review', today, 'weekly');
    await page.getByRole('button', { name: 'Cancel Weekly review', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'Task cancelled.' }).waitFor();
    await add('Daily unfinished', today, 'daily');
    await add('Future repeat', shift(1), 'weekly');
    await page.locator('.recurrences summary').click();
    await page.getByRole('button', { name: 'Stop repeating Future repeat', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'Repeating stopped.' }).waitFor();
    let repeatView = await page.evaluate(async () => (await fetch('/api/tasks')).json()) as TaskView;
    assert.equal(repeatView.recurrences.length, 3);
    assert.equal(repeatView.history.find(task => task.title === 'Future repeat')?.status, 'cancelled');
    mark('second-instance');
    await promisify(execFile)(executable, [], { env: environment, timeout: 20_000, windowsHide: true });
    mark('close-and-relaunch'); await closeApp(); page = await launch();
    await page.getByText('Review the first Today workflow', { exact: true }).waitFor();
    repeatView = await page.evaluate(async () => (await fetch('/api/tasks')).json()) as TaskView;
    assert.equal(repeatView.due.length, 4); assert.equal(repeatView.upcoming.length, 1); assert.equal(repeatView.history.length, 5);
    // Seed the disposable profile as if its last run was in the previous period.
    // The installed app then reconciles using its real clock, with no product clock override.
    mark('seed-previous-periods'); await closeApp();
    const writer = new DatabaseSync(join(data, 'tracker.db'));
    try {
      writer.exec('BEGIN IMMEDIATE');
      for (const rule of repeatView.recurrences) {
        const previous = shift(rule.frequency === 'daily' ? -1 : -7);
        writer.prepare('UPDATE tasks SET planned_date=? WHERE recurrence_id=?').run(previous, rule.id);
        writer.prepare('UPDATE recurrence_rules SET start_date=?,next_date=? WHERE id=?').run(previous, today, rule.id);
      }
      writer.exec('COMMIT');
    } finally { writer.close(); }
    mark('installed-period-rollover'); page = await launch();
    await page.getByRole('checkbox', { name: 'Complete Daily check-in', exact: true }).waitFor();
    await page.getByRole('checkbox', { name: 'Complete Weekly review', exact: true }).waitFor();
    await page.getByRole('checkbox', { name: 'Complete Daily unfinished', exact: true }).waitFor();
    const rolled = await page.evaluate(async () => (await fetch('/api/tasks')).json()) as TaskView;
    assert.equal(rolled.due.length, 6); assert.equal(rolled.upcoming.length, 1); assert.equal(rolled.history.length, 6);
    assert.ok(rolled.due.filter(task => task.recurrenceId).every(task => task.plannedDate === today));
    assert.equal(rolled.history.find(task => task.title === 'Daily unfinished')?.status, 'missed');
    assert.equal(rolled.history.find(task => task.title === 'Daily check-in')?.status, 'completed');
    assert.equal(rolled.history.find(task => task.title === 'Weekly review')?.status, 'cancelled');
    await page.getByRole('button', { name: /History/ }).click();
    await page.getByText('Missed', { exact: true }).waitFor();
    await page.screenshot({ path: join(artifacts, 'recurrence-history.png'), fullPage: true });
    mark('repeat-rollover-restart'); await closeApp(); page = await launch();
    const reopened = await page.evaluate(async () => (await fetch('/api/tasks')).json()) as TaskView;
    assert.deepEqual(reopened, rolled);
  }
  mark('final-close'); await closeApp();
  assert.deepEqual(await readFile(join(root, 'phase0.db')), sentinelBytes);
  assert.ok(!resolve(profile).startsWith(dirname(executable)), 'Product data is outside installation output.');
  await writeFile(join(artifacts, 'report.json'), JSON.stringify({ status: 'verified',
    scope: recovery ? 'Schema 2 task data migration and separate snapshot recovery.'
      : 'Installed Today, daily/weekly controls, stop, prior-period fixture rollover, restart, text escaping and second instance.',
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
