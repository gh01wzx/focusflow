import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import type { ElectronApplication } from 'playwright-core';
import { runInstallerProcess } from './installer-process.ts';

// Run only in the guarded disposable installer experiment. Never open a real user's shortcuts.
export async function checkInstalledEntry(application: ElectronApplication, installation: string,
  environment: NodeJS.ProcessEnv): Promise<void> {
  assert.equal(process.platform, 'win32');
  assert.equal(process.env.GITHUB_ACTIONS, 'true');
  assert.equal(process.env.RUNNER_ENVIRONMENT, 'github-hosted');
  const executable = join(installation, 'FocusFlow.exe');
  assert.ok(process.env.APPDATA);
  const shortcuts = await application.evaluate(({ app, shell }, installerRoaming: string) => {
    const paths = [app.getPath('desktop') + '\\FocusFlow.lnk',
      installerRoaming + '\\Microsoft\\Windows\\Start Menu\\Programs\\FocusFlow.lnk'];
    // Installer shell paths belong to the hosted Windows user, not the synthetic app profile.
    return paths.map(path => shell.readShortcutLink(path));
  }, process.env.APPDATA);
  for (const shortcut of shortcuts) {
    assert.equal(resolve(shortcut.target).toLowerCase(), resolve(executable).toLowerCase());
    assert.equal(shortcut.args ?? '', '', 'Everyday shortcuts must not select review/developer data.');
  }
  const page = await application.firstWindow();
  const origin = new URL(page.url()).origin;
  const before = await page.evaluate(async () => ({
    tasks: await (await fetch('/api/tasks')).json() as unknown,
    projects: await (await fetch('/api/project-actions')).json() as unknown,
  }));
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.minimize());
  // Use the checked shortcut target with an isolated profile. No Node/npm or checkout is needed.
  const duplicate = await runInstallerProcess(shortcuts[0]!.target, [], environment, 15000);
  assert.equal(duplicate.spawnFailed, false);
  assert.equal(duplicate.timedOut, false, 'Duplicate launch must exit without another database owner.');
  assert.equal(duplicate.code, 0);
  await application.evaluate(async ({ BrowserWindow }) => {
    const deadline = Date.now() + 5000;
    while (BrowserWindow.getAllWindows()[0]!.isMinimized() && Date.now() < deadline) {
      await new Promise(resolveWait => setTimeout(resolveWait, 50));
    }
  });
  assert.deepEqual(await application.evaluate(({ BrowserWindow }) => {
    const windows = BrowserWindow.getAllWindows();
    return { count: windows.length, minimized: windows[0]!.isMinimized(), visible: windows[0]!.isVisible() };
  }), { count: 1, minimized: false, visible: true });
  assert.equal(new URL(page.url()).origin, origin);
  assert.deepEqual(await page.evaluate(async () => ({
    tasks: await (await fetch('/api/tasks')).json() as unknown,
    projects: await (await fetch('/api/project-actions')).json() as unknown,
  })), before);
  console.log('INSTALLED_ENTRY_VERIFIED: shortcuts, restored window, one data owner, retained records');
}

export async function checkInvalidLaunch(executable: string, environment: NodeJS.ProcessEnv): Promise<void> {
  assert.equal(process.env.GITHUB_ACTIONS, 'true');
  assert.equal(process.env.RUNNER_ENVIRONMENT, 'github-hosted');
  assert.ok(environment.FOCUSFLOW_TEST_PROFILE);
  // A conflicting review/test selection must fail before opening either data profile.
  await assert.rejects(promisify(execFile)(executable, ['--review', 'invalid-launch'], {
    env: environment, windowsHide: true, timeout: 15000, maxBuffer: 64 * 1024,
  }), (error: unknown) => {
    const failure = error as { code?: unknown; stderr?: unknown; killed?: unknown };
    return failure.code === 1 && failure.killed !== true && typeof failure.stderr === 'string'
      && failure.stderr.includes('FocusFlow could not prepare its data profile.')
      && !failure.stderr.includes('A JavaScript error occurred');
  });
  console.log('INVALID_LAUNCH_VERIFIED: understandable profile error before data access');
}
