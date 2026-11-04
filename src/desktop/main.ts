import { app, BrowserWindow, dialog } from 'electron';
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { startTaskServer } from '../tasks/server.ts';
import type { LocalServer } from '../tasks/server.ts';
import { MigrationError, NewerDatabaseError } from '../database/migrate.ts';

app.setName('FocusFlow');
app.setAppUserModelId('dev.focusflow.desktop');
const profileDirectory = process.env.FOCUSFLOW_TEST_PROFILE
  ? resolve(process.env.FOCUSFLOW_TEST_PROFILE)
  : join(process.env.LOCALAPPDATA ?? app.getPath('appData'), 'FocusFlow', 'desktop');
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
    service = await startTaskServer({ dataDirectory: join(profileDirectory, 'data') });
    const origin = service.origin;
    window = new BrowserWindow({
      width: 1120,
      height: 840,
      minWidth: 800,
      minHeight: 640,
      show: false,
      backgroundColor: '#f8f9f6',
      title: 'FocusFlow',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true,
      },
    });
    window.removeMenu();
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
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
