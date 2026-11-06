import { _electron as electron } from 'playwright-core';
import type { ElectronApplication } from 'playwright-core';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { selectProfile } from '../src/runtime/profile.ts';
import { SCHEMA_VERSION } from '../src/database/schema.ts';
import { openWorkspaceStore } from '../src/workspace/store.ts';
import { localDay } from '../src/shared/calendar.ts';
import type { TaskView } from '../src/shared/tasks.ts';

assert.ok(process.argv[2], 'Provide the installed FocusFlow executable.');
const executable = resolve(process.argv[2]);
const root = await mkdtemp(join(tmpdir(), 'focusflow-review-smoke-'));
const artifacts = resolve('artifacts', 'review');
await mkdir(artifacts, { recursive: true });
const environment: Record<string, string> = {};
for (const key of ['PATH', 'Path', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH', 'COMSPEC']) {
  if (process.env[key]) environment[key] = process.env[key];
}
environment.LOCALAPPDATA = join(root, 'local');
environment.APPDATA = join(root, 'roaming');
await mkdir(environment.APPDATA, { recursive: true });
const profile = (args: string[]) => selectProfile({ packaged: true, args,
  localDataDirectory: environment.LOCALAPPDATA!, checkoutDirectory: root, schemaVersion: SCHEMA_VERSION });
const personalDatabase = join(profile([]).directory, 'data', 'tracker.db');
const owned = new Set<ElectronApplication>();
let stage = 'prepare';
const mark = (value: string) => { stage = value; console.log(`REVIEW_STAGE: ${value}`); };

async function launch(args: string[]) {
  const application = await electron.launch({ executablePath: executable, args, env: environment, timeout: 30_000 });
  owned.add(application);
  const page = await application.firstWindow({ timeout: 15_000 });
  page.setDefaultTimeout(10_000);
  await page.getByRole('heading', { name: 'Today.', exact: true }).waitFor();
  await page.waitForFunction(() => !(document.getElementById('task-title') as HTMLInputElement).disabled);
  assert.equal(await application.evaluate(({ app }) => app.getPath('userData')), profile(args).directory);
  return { application, page };
}

async function close(application: ElectronApplication) {
  owned.delete(application);
  const child = application.process();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const exited = child.exitCode !== null ? Promise.resolve(child.exitCode)
      : new Promise<number | null>(resolveExit => child.once('exit', resolveExit));
    const window = application.windows()[0];
    if (window) void window.close().catch(() => {});
    assert.equal(await Promise.race([exited, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('Review smoke did not close within 15 seconds.')), 15_000);
    })]), 0, 'Each owned app must exit gracefully.');
  } catch (error) {
    if (child.pid && child.exitCode === null) {
      const killer = spawn(join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'taskkill.exe'),
        ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
      killer.on('error', () => child.kill('SIGKILL'));
    }
    throw error;
  } finally { if (timer) clearTimeout(timer); }
}

try {
  const store = await openWorkspaceStore(personalDatabase);
  store.tasks.add({ title: 'Everyday task stays here', plannedDate: localDay(new Date()) });
  store.close();
  const personalBytes = await readFile(personalDatabase);
  mark('ordinary-installed-data');
  const personal = await launch([]);
  await personal.page.getByText('Everyday task stays here', { exact: true }).waitFor();
  assert.equal(await personal.page.getByRole('note').count(), 0);
  mark('named-review-alongside-ordinary-app');
  let review = await launch(['--review', 'pr-72']);
  await review.page.getByRole('note').filter({ hasText: 'Sample data' }).waitFor();
  assert.match(await review.page.title(), /Review pr-72 - Sample data/);
  assert.equal(await review.page.getByText('Everyday task stays here', { exact: true }).count(), 0);
  await review.page.getByRole('checkbox', { name: 'Complete Try completing this sample task', exact: true }).click();
  await review.page.getByRole('status').filter({ hasText: 'Task completed.' }).waitFor();
  await review.page.getByLabel('Task title', { exact: true }).fill('Review change persists');
  await review.page.getByRole('button', { name: 'Add task', exact: true }).click();
  await review.page.getByRole('status').filter({ hasText: 'Task added.' }).waitFor();
  const saved = await review.page.evaluate(async () => (await fetch('/api/tasks')).json()) as TaskView;
  await review.page.getByRole('navigation', { name: 'Workspaces', exact: true })
    .getByRole('button', { name: 'Projects', exact: true }).click();
  await review.page.getByRole('navigation', { name: 'Project list', exact: true })
    .getByRole('button', { name: 'Sample project', exact: true }).click();
  await review.page.getByRole('heading', { name: 'Sample project', exact: true }).waitFor();
  await review.page.getByRole('note').filter({ hasText: 'Review pr-72' }).waitFor();
  await review.page.screenshot({ path: join(artifacts, 'sample-projects.png'), fullPage: true });
  mark('github-os-storage-and-simulated-confirmation');
  assert.equal(await review.application.evaluate(async ({ safeStorage }) => {
    if (!await safeStorage.isAsyncEncryptionAvailable()) return false;
    const plain = 'disposable safeStorage fixture';
    const encrypted = await safeStorage.encryptStringAsync(plain);
    const decrypted = await safeStorage.decryptStringAsync(encrypted);
    return decrypted.result === plain && !encrypted.includes(Buffer.from(plain));
  }), true, 'Real Windows OS-protected credential storage must round-trip.');
  const sample = { available: true, connected: true, account: 'simulated-account' as string | null, clientId: 'Iv1.fixture',
    repository: null as { id: number; fullName: string; private: boolean } | null,
    preview: null as { id: number; fullName: string; private: boolean } | null,
    repositories: [{ id: 17, fullName: 'sample/public-work', private: false }],
    userCode: null, nextPollAt: 0, message: 'Simulated GitHub account for UI verification only.' };
  let confirmedRequests = 0;
  let failCheck = false;
  let delayRead = false;
  let readStarted!: () => void;
  let releaseRead!: () => void;
  const staleReadStarted = new Promise<void>(resolve => { readStarted = resolve; });
  const staleReadReleased = new Promise<void>(resolve => { releaseRead = resolve; });
  await review.page.route('**/api/projects/*/github**', async route => {
    const action = new URL(route.request().url()).pathname.split('/').at(-1);
    if (route.request().method() === 'GET' && delayRead) {
      const stale = structuredClone(sample);
      readStarted();
      await staleReadReleased;
      await route.fulfill({ json: stale });
      return;
    }
    if (action === 'check' && failCheck) {
      await route.fulfill({ status: 503, json: { error: 'Simulated connection failure.' } });
      return;
    }
    const body = route.request().method() === 'POST' ? route.request().postDataJSON() as Record<string, unknown> : {};
    if (action === 'inspect') { sample.preview = sample.repositories[0]!; sample.message = 'Review repository name and visibility.'; }
    if (action === 'connect') {
      assert.equal(body.confirmed, true); assert.equal(body.repositoryId, 17);
      confirmedRequests++; sample.repository = sample.preview; sample.preview = null;
      sample.message = 'Repository linked locally. No Issue, branch or pull request was created.';
    }
    if (action === 'disconnect') { sample.connected = false; sample.account = null; sample.repository = null; sample.message = 'Local access removed; task data unchanged.'; }
    await route.fulfill({ json: sample });
  });
  // Remount so the initial status uses the clearly simulated fixture.
  await review.page.getByRole('button', { name: 'Action center', exact: true }).click();
  await review.page.getByRole('navigation', { name: 'Project list', exact: true })
    .getByRole('button', { name: 'Sample project', exact: true }).click();
  await review.page.getByText('GitHub connection', { exact: true }).click();
  await review.page.getByText('Simulated GitHub account for UI verification only.', { exact: true }).waitFor();
  await review.page.getByLabel('Repository owner/name', { exact: true }).fill('sample/public-work');
  await review.page.getByRole('button', { name: 'Inspect repository', exact: true }).click();
  await review.page.getByText('Public repository', { exact: false }).waitFor();
  assert.equal(await review.page.getByRole('button', { name: 'Connect repository', exact: true }).isDisabled(), true);
  assert.equal(confirmedRequests, 0);
  await review.page.getByRole('checkbox', { name: 'I confirm this repository for this project.', exact: true }).check();
  await review.page.getByLabel('Repository owner/name', { exact: true }).fill('sample/another');
  assert.equal(await review.page.getByRole('button', { name: 'Connect repository', exact: true }).count(), 0);
  assert.equal(confirmedRequests, 0);
  await review.page.getByLabel('Repository owner/name', { exact: true }).fill('sample/public-work');
  await review.page.getByRole('button', { name: 'Inspect repository', exact: true }).click();
  await review.page.getByRole('checkbox', { name: 'I confirm this repository for this project.', exact: true }).check();
  await review.page.getByRole('button', { name: 'Connect repository', exact: true }).click();
  await review.page.getByText('Repository linked locally. No Issue, branch or pull request was created.', { exact: true }).waitFor();
  assert.equal(confirmedRequests, 1);
  await review.page.screenshot({ path: join(artifacts, 'github-connection-simulated.png'), fullPage: true });
  failCheck = true;
  await review.page.getByRole('button', { name: 'Check account and repositories', exact: true }).click();
  await review.page.getByRole('alert').filter({ hasText: 'Simulated connection failure.' }).waitFor();
  delayRead = true;
  await review.page.getByRole('button', { name: 'Retry connection', exact: true }).click();
  let readTimer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([staleReadStarted, new Promise<never>((_, reject) => {
      readTimer = setTimeout(() => reject(new Error('Delayed GitHub status request was not reached.')), 10000);
    })]);
    await review.page.getByRole('button', { name: 'Disconnect this profile', exact: true }).click();
    await review.page.getByText('Local access removed; task data unchanged.', { exact: true }).waitFor();
    const staleResponse = review.page.waitForResponse(response => response.request().method() === 'GET'
      && new URL(response.url()).pathname.endsWith('/github'));
    releaseRead();
    await (await staleResponse).finished();
  } finally { if (readTimer) clearTimeout(readTimer); releaseRead(); }
  await review.page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await review.page.getByText('Account: Not connected', { exact: true }).waitFor();
  assert.equal(await review.page.getByRole('button', { name: 'Check account and repositories', exact: true }).count(), 0);
  await review.page.getByRole('heading', { name: 'Sample project', exact: true }).waitFor();
  await review.page.unrouteAll({ behavior: 'wait' });
  mark('reopen-same-review-data');
  await close(review.application);
  review = await launch(['--review', 'pr-72']);
  await review.page.getByText('Review change persists', { exact: true }).waitFor();
  const reopened = await review.page.evaluate(async () => (await fetch('/api/tasks')).json()) as TaskView;
  assert.deepEqual(reopened, saved);
  await review.page.screenshot({ path: join(artifacts, 'sample-personal.png'), fullPage: true });
  await close(review.application);
  await close(personal.application);
  assert.deepEqual(await readFile(personalDatabase), personalBytes);
  mark('ordinary-data-still-opens');
  const reopenedPersonal = await launch([]);
  await reopenedPersonal.page.getByText('Everyday task stays here', { exact: true }).waitFor();
  assert.equal(await reopenedPersonal.page.getByText('Review change persists', { exact: true }).count(), 0);
  await close(reopenedPersonal.application);
  assert.deepEqual(await readFile(personalDatabase), personalBytes);
  await writeFile(join(artifacts, 'report.json'), JSON.stringify({ status: 'verified',
    scope: 'Installed ordinary/review apps run separately; sample edits and visible labels survive restart; ordinary sample sentinel data stays unchanged.' }, null, 2));
  console.log('REVIEW_SMOKE_VERIFIED');
} catch (error) {
  await writeFile(join(artifacts, 'failure.json'), JSON.stringify({ stage,
    message: error instanceof Error ? error.message : 'Review smoke failed' }));
  throw error;
} finally {
  for (const application of owned) await close(application);
  assert.equal(dirname(resolve(root)), resolve(tmpdir()));
  assert.ok(basename(root).startsWith('focusflow-review-smoke-'));
  await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
