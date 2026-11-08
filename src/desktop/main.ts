import { app, BrowserWindow, dialog, safeStorage, shell } from 'electron';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { startWorkspaceServer } from '../workspace/server.ts';
import type { LocalServer } from '../http/local-server.ts';
import { MigrationError, NewerDatabaseError } from '../database/migrate.ts';
import { SCHEMA_VERSION } from '../database/schema.ts';
import { selectProfile } from '../runtime/profile.ts';
import { createAiService } from '../ai/service.ts';
import { createAiRuntime } from '../ai/runtime.ts';
import { AI_SETUP_URL, isAiSignInUrl } from '../shared/ai.ts';

import { createGitHubVault } from '../github/vault.ts';
import { createGitHubService } from '../github/service.ts';
import { isGitHubIssueUrl, isGitHubPullUrl } from '../shared/github.ts';
import { awaitInterfaceReady, StartupFailure } from '../runtime/startup.ts';
import { RUNTIME_MARKER } from '../runtime/diagnostic.ts';

app.setName('FocusFlow');
app.setAppUserModelId('dev.focusflow.desktop');
if (process.argv.includes('--runtime-diagnostic')) {
  void app.whenReady().then(() => { console.log(RUNTIME_MARKER); app.exit(0); }, () => app.exit(1));
} else {
const profile = selectProfile({ packaged: app.isPackaged, args: process.argv,
  localDataDirectory: process.env.LOCALAPPDATA ?? app.getPath('appData'),
  checkoutDirectory: app.getAppPath(), schemaVersion: SCHEMA_VERSION,
  testProfile: process.env.FOCUSFLOW_TEST_PROFILE });
const profileDirectory = profile.directory;
mkdirSync(profileDirectory, { recursive: true });
app.setPath('userData', profileDirectory);

let window: BrowserWindow | null = null;
let service: LocalServer | undefined;
let closing = false;
const traceShutdown = (stage: string) => {
  if (process.env.FOCUSFLOW_SHUTDOWN_TRACE === '1') console.log('FOCUSFLOW_SHUTDOWN:' + stage);
};

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (window?.isMinimized()) window.restore();
    window?.show();
    window?.focus();
  });

  app.on('before-quit', event => {
    if (closing || !service) return;
    event.preventDefault();
    closing = true;
    traceShutdown('desktop:begin');
    // Release renderer connections before awaiting the local HTTP service.
    window?.destroy();
    void service.close().then(() => { traceShutdown('desktop:complete'); app.quit(); },
      () => { traceShutdown('desktop:failed'); app.exit(1); });
  });
  app.on('window-all-closed', () => { if (!closing) app.quit(); });

  void app.whenReady().then(async () => {
    let confirmReady!: () => void;
    const ready = new Promise<void>(resolve => { confirmReady = resolve; });
    const ai = createAiService(createAiRuntime(process.env.LOCALAPPDATA ?? app.getPath('appData'), true, profileDirectory));
    const github = createGitHubService(createGitHubVault(join(profileDirectory, 'github'), {
      available: async () => process.platform === 'win32' && await safeStorage.isAsyncEncryptionAvailable(),
      encrypt: value => safeStorage.encryptStringAsync(value),
      decrypt: async value => (await safeStorage.decryptStringAsync(value)).result,
    }));
    service = await startWorkspaceServer({ dataDirectory: join(profileDirectory, 'data'), sampleLabel: profile.sampleLabel,
      github, ai, onShutdown: traceShutdown, onInterfaceReady: confirmReady, appVersion: app.getVersion() });
    const origin = service.origin;
    window = new BrowserWindow({
      width: 1120,
      height: 840,
      minWidth: 800,
      minHeight: 640,
      show: false,
      backgroundColor: '#f8f9f6',
      title: profile.sampleLabel ? `FocusFlow - ${profile.sampleLabel} - Sample data` : 'FocusFlow',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true,
      },
    });
    window.removeMenu();
    window.webContents.setWindowOpenHandler(({ url }) => {
      if (url === AI_SETUP_URL || isAiSignInUrl(url) || isGitHubIssueUrl(url) || isGitHubPullUrl(url) ||
          ['https://github.com/login/device', 'https://github.com/settings/apps'].includes(url)) {
        void shell.openExternal(url).catch(() => {});
      }
      return { action: 'deny' };
    });
    window.webContents.on('will-navigate', (event, url) => {
      if (url !== origin + '/') event.preventDefault();
    });
    window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    window.webContents.session.setPermissionCheckHandler(() => false);
    window.webContents.session.on('will-download', event => event.preventDefault());
    window.on('closed', () => { window = null; });
    await awaitInterfaceReady(() => window!.loadURL(origin), ready);
    window?.show();
  }).catch(async (error: unknown) => {
    const message = error instanceof NewerDatabaseError
      ? 'This data belongs to a newer app version. Reinstall that version, or restore a verified backup to a separate location before using an older version.'
      : error instanceof MigrationError
      ? 'The database upgrade failed and was rolled back. Keep the data directory and its backups. Use a compatible previous version or follow the recovery guide.'
      : error instanceof StartupFailure && error.code === 'WINDOW_LOAD_FAILED'
      ? 'The desktop window could not load the local interface. Keep your data and report this build. Run the single-attempt desktop diagnostic before another launch.'
      : error instanceof StartupFailure
      ? 'The interface did not confirm usable task data within 15 seconds. A blank window is not a successful start. Keep your data and report this build; do not repeatedly relaunch unchanged.'
      : 'FocusFlow could not open your local data. Keep the data directory and backups, check available disk space, and try again.';
    if (process.env.FOCUSFLOW_TEST_PROFILE) console.error(message);
    else dialog.showErrorBox('FocusFlow could not start', message);
    window?.destroy();
    await service?.close().catch(() => {});
    app.exit(1);
  });
}
}
