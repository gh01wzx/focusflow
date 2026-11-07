import { _electron as electron } from 'playwright-core';
import type { ElectronApplication, Page } from 'playwright-core';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { restoreSnapshot } from '../src/database/backup.ts';
import { openWorkspaceStore } from '../src/workspace/store.ts';
import { SCHEMA_VERSION } from '../src/database/schema.ts';
import { localDay } from '../src/shared/calendar.ts';
import type { TaskView } from '../src/shared/tasks.ts';
import type { ProjectView } from '../src/shared/projects.ts';
import { installerEnvironment, runInstallerProcess } from './installer-process.ts';

assert.equal(process.platform, 'win32', 'Run only on the disposable Windows Actions runner.');
assert.equal(process.env.GITHUB_ACTIONS, 'true', 'Installer registration and shortcuts require a disposable Actions runner.');
assert.equal(process.env.RUNNER_ENVIRONMENT, 'github-hosted', 'Do not install experimental builds on a personal or self-hosted runner.');
assert.ok(process.argv[2] && process.argv[3], 'Provide baseline and candidate installers.');
const baseline = resolve(process.argv[2]!);
const candidate = resolve(process.argv[3]!);
const root = await mkdtemp(join(tmpdir(), 'focusflow-install-update-'));
const installation = join(root, 'installed');
const profile = join(root, 'profile');
const artifacts = resolve('artifacts', 'install-update');
await mkdir(artifacts, { recursive: true });
const environment: Record<string, string> = {};
for (const key of ['PATH', 'Path', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH', 'COMSPEC']) {
  if (process.env[key]) environment[key] = process.env[key]!;
}
// NSIS invokes Windows shell/PowerShell helpers against the real hosted profile.
// Only app processes use synthetic profile paths; credentials stay excluded.
const setupEnvironment = installerEnvironment(process.env);
environment.LOCALAPPDATA = join(root, 'local');
environment.APPDATA = join(root, 'roaming');
environment.FOCUSFLOW_TEST_PROFILE = profile;
await mkdir(environment.APPDATA, { recursive: true });
const installerRuns: unknown[] = [];
const digest = async (path: string) => createHash('sha256').update(await readFile(path)).digest('hex');
let application: ElectronApplication | undefined;
let stage = 'prepare';
const mark = (value: string) => { stage = value; console.log('INSTALL_UPDATE_STAGE: ' + value); };
const database = join(profile, 'data', 'tracker.db');

async function install(installer: string) {
  assert.equal(application, undefined, 'Close the owned app before replacing its binaries.');
  const result = await runInstallerProcess(installer, ['/S', '/D=' + installation], setupEnvironment);
  installerRuns.push({ installer: basename(installer), ...result,
    executablePresent: existsSync(join(installation, 'FocusFlow.exe')),
    packagePresent: existsSync(join(installation, 'resources', 'app.asar')) });
  await writeFile(join(artifacts, 'installer-processes.json'), JSON.stringify(installerRuns, null, 2));
  assert.equal(result.spawnFailed, false, 'Installer process could not start.');
  assert.equal(result.timedOut, false, 'Installer parent timed out; stop without retrying.');
  assert.equal(result.exited, true, 'Could not confirm that the owned installer parent stopped.');
  assert.equal(result.code, 0, 'Installer parent must report a successful exit.');
}
async function launch(version: string) {
  application = await electron.launch({ executablePath: join(installation, 'FocusFlow.exe'), env: environment, timeout: 30000 });
  assert.equal(await application.evaluate(({ app }) => app.getVersion()), version);
  assert.equal(await application.evaluate(({ app }) => app.getPath('userData')), profile);
  const page = await application.firstWindow({ timeout: 15000 });
  page.setDefaultTimeout(10000);
  await page.getByRole('heading', { name: 'Today.', exact: true }).waitFor();
  await page.waitForFunction(() => !(document.getElementById('task-title') as HTMLInputElement).disabled);
  return page;
}
async function close() {
  if (!application) return;
  const owned = application; application = undefined;
  const child = owned.process();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const exited = child.exitCode !== null ? Promise.resolve(child.exitCode)
      : new Promise<number | null>(resolveExit => child.once('exit', resolveExit));
    const window = owned.windows()[0];
    if (window) void window.close().catch(() => {});
    const code = await Promise.race([exited, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('Owned app close timed out; stop this experiment without retrying.')), 15000);
    })]);
    assert.equal(code, 0, 'Owned app must close cleanly before another install.');
  } catch (error) {
    if (child.pid && child.exitCode === null) {
      const killer = spawn(join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'taskkill.exe'),
        ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
      await new Promise<void>(resolveKill => {
        const deadline = setTimeout(() => { child.kill('SIGKILL'); resolveKill(); }, 5000);
        killer.once('error', () => { clearTimeout(deadline); child.kill('SIGKILL'); resolveKill(); });
        killer.once('exit', () => { clearTimeout(deadline); resolveKill(); });
      });
    }
    throw error;
  } finally { if (timer) clearTimeout(timer); }
}
async function post(page: Page, path: string, body: unknown): Promise<unknown> {
  return page.evaluate(async ({ path, body }) => {
    const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!response.ok) throw new Error('Disposable fixture request failed: ' + response.status);
    return response.json() as Promise<unknown>;
  }, { path, body });
}
async function views(page: Page, projectId: string) {
  return page.evaluate(async id => {
    const tasks = await fetch('/api/tasks'); const projects = await fetch('/api/projects?projectId=' + id);
    if (!tasks.ok || !projects.ok) throw new Error('Could not read disposable update data.');
    return { tasks: await tasks.json() as TaskView, projects: await projects.json() as ProjectView };
  }, projectId);
}
try {
  mark('install-baseline');
  await install(baseline);
  let page = await launch('0.1.0-alpha.3');
  const today = localDay(new Date());
  await post(page, '/api/tasks', { title: 'Retain through installer replacement', plannedDate: today });
  await post(page, '/api/recurrences', { title: 'Retain weekly plan', frequency: 'weekly', plannedDate: today, weekdays: [1, 3] });
  const added = await post(page, '/api/projects', { title: 'Retained project', description: 'Disposable update fixture' }) as { view: ProjectView };
  const projectId = added.view.selectedProjectId!;
  const milestone = await post(page, '/api/milestones', { projectId, title: 'Retained milestone' }) as { view: ProjectView };
  const first = await post(page, '/api/project-tickets', { milestoneId: milestone.view.milestones[0]!.id,
    title: 'Retained prerequisite', description: 'Keep original work', acceptanceCriteria: 'Data survives replacement.' }) as { view: ProjectView };
  const prerequisiteId = first.view.tickets[0]!.id;
  const second = await post(page, '/api/project-tickets', { milestoneId: milestone.view.milestones[0]!.id,
    title: 'Retained dependent ticket', description: 'Keep the prerequisite link', acceptanceCriteria: 'Dependency survives replacement.' }) as { view: ProjectView };
  const dependentId = second.view.tickets.find(ticket => ticket.id !== prerequisiteId)!.id;
  await post(page, '/api/project-tickets/' + dependentId + '/prerequisites', { prerequisiteIds: [prerequisiteId] });
  await post(page, '/api/project-tickets/' + prerequisiteId + '/status', { status: 'done' });
  await post(page, '/api/project-tickets/' + dependentId + '/status', { status: 'backlog' });
  const saved = await views(page, projectId);
  assert.equal(saved.projects.tickets.length, 2);
  assert.deepEqual(saved.projects.dependencies, [{ ticketId: dependentId, prerequisiteId }]);
  const snapshot = await post(page, '/api/tasks/backup', {}) as { name: string };
  assert.equal(basename(snapshot.name), snapshot.name);
  const source = join(profile, 'data', 'backups', snapshot.name);
  await page.screenshot({ path: join(artifacts, 'baseline.png'), fullPage: true });
  mark('close-baseline'); await close();
  const databaseBefore = await digest(database);
  mark('install-candidate');
  await install(candidate);
  assert.equal(await digest(database), databaseBefore, 'Installer must leave task bytes alone.');
  page = await launch('0.1.0-alpha.4');
  assert.deepEqual(await views(page, projectId), saved);
  await page.screenshot({ path: join(artifacts, 'candidate.png'), fullPage: true });
  mark('close-candidate'); await close();
  const beforeRestore = await digest(database);
  mark('restore-backup-to-separate-target');
  const restoredPath = join(root, 'separate-recovery', 'tracker.db');
  await restoreSnapshot(source, restoredPath);
  const restored = await openWorkspaceStore(restoredPath);
  try {
    // Compare the same JSON contract returned by the installed HTTP service.
    // SQLite intentionally returns null-prototype row objects.
    assert.deepEqual(JSON.parse(JSON.stringify(restored.tasks.view())) as unknown, saved.tasks);
    assert.deepEqual(JSON.parse(JSON.stringify(restored.projects.view(projectId))) as unknown, saved.projects);
  } finally { restored.close(); }
  assert.equal(await digest(database), beforeRestore, 'Separate recovery must not alter the current database.');
  mark('reinstall-baseline-same-schema');
  await install(baseline);
  page = await launch('0.1.0-alpha.3');
  assert.deepEqual(await views(page, projectId), saved);
  mark('close-restored-baseline'); await close();
  await writeFile(join(artifacts, 'report.json'), JSON.stringify({
    status: 'verified', commit: process.env.GITHUB_SHA ?? 'unknown', schema: SCHEMA_VERSION,
    baseline: { version: '0.1.0-alpha.3', sha256: await digest(baseline) },
    candidate: { version: '0.1.0-alpha.4', sha256: await digest(candidate) },
    scope: 'Unsigned offline full-installer replacement of the same code/schema, exact Personal/repeat/project/prerequisite/status data preservation, separate snapshot recovery and same-schema binary rollback.',
    unverified: 'No signed update feed, download/signature verification, SmartScreen acceptance, in-app one-click updater or cross-schema downgrade proof.',
  }, null, 2));
  console.log('INSTALL_UPDATE_VERIFIED');
} catch (error) {
  await writeFile(join(artifacts, 'failure.json'), JSON.stringify({ stage,
    message: error instanceof Error ? error.message : 'Install/update experiment failed',
    stop: 'No native launch retry. Inspect this stage and owned-process logs before a new experiment.' }, null, 2));
  throw error;
} finally {
  await close();
  assert.equal(dirname(resolve(root)), resolve(tmpdir()));
  assert.ok(basename(root).startsWith('focusflow-install-update-'));
  await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
