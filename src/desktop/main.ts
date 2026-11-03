import { app, BrowserWindow, dialog } from 'electron';
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { startServer } from '../server.ts';
import type { LocalServer } from '../server.ts';

app.setName('FocusFlow Phase 0');
const profileDirectory = process.env.FOCUSFLOW_DESKTOP_TEST_DATA_DIR
  ? resolve(process.env.FOCUSFLOW_DESKTOP_TEST_DATA_DIR)
  : join(app.getPath('appData'), 'FocusFlow', 'phase0-desktop');
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
    void service.close().then(() => app.quit(), () => app.exit(1));
  });
  app.on('window-all-closed', () => app.quit());

  void app.whenReady().then(async () => {
    service = await startServer({ dataDirectory: join(profileDirectory, 'data') });
    const origin = service.origin;
    window = new BrowserWindow({
      width: 1120,
      height: 840,
      minWidth: 800,
      minHeight: 640,
      show: false,
      backgroundColor: '#f2f4f1',
      title: 'FocusFlow Phase 0',
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
  }).catch(() => {
    dialog.showErrorBox('FocusFlow could not start', 'The local desktop experiment could not start. Check available disk space and try again.');
    app.exit(1);
  });
}
