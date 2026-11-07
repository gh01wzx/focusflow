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

app.setName('FocusFlow');
app.setAppUserModelId('dev.focusflow.desktop');
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
    // Release renderer connections before awaiting the local HTTP service.
    window?.destroy();
    void service.close().then(() => app.quit(), () => app.exit(1));
  });
  app.on('window-all-closed', () => { if (!closing) app.quit(); });

  void app.whenReady().then(async () => {
    const ai = createAiService(createAiRuntime(process.env.LOCALAPPDATA ?? app.getPath('appData'), true, profileDirectory));
    const github = createGitHubService(createGitHubVault(join(profileDirectory, 'github'), {
      available: async () => process.platform === 'win32' && await safeStorage.isAsyncEncryptionAvailable(),
      encrypt: value => safeStorage.encryptStringAsync(value),
      decrypt: async value => (await safeStorage.decryptStringAsync(value)).result,
    }));
    service = await startWorkspaceServer({ dataDirectory: join(profileDirectory, 'data'), sampleLabel: profile.sampleLabel, github, ai });
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
      if (url === AI_SETUP_URL || isAiSignInUrl(url) ||
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
    window.once('ready-to-show', () => window?.show());
    window.on('closed', () => { window = null; });
    await window.loadURL(origin);
  }).catch((error: unknown) => {
    const message = error instanceof NewerDatabaseError
      ? 'This data belongs to a newer app version. Reinstall that version, or restore a verified backup to a separate location before using an older version.'
      : error instanceof MigrationError
      ? 'The database upgrade failed and was rolled back. Keep the data directory and its backups. Use a compatible previous version or follow the recovery guide.'
      : 'FocusFlow could not open your local data. Keep the data directory and backups, check available disk space, and try again.';
    if (process.env.FOCUSFLOW_TEST_PROFILE) console.error(message);
    else dialog.showErrorBox('FocusFlow could not start', message);
    app.exit(1);
  });
}
