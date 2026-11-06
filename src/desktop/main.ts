import { app, BrowserWindow, dialog } from 'electron';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { startWorkspaceServer } from '../workspace/server.ts';
import type { LocalServer } from '../http/local-server.ts';
import { SCHEMA_VERSION } from '../database/schema.ts';
import { selectProfile } from '../runtime/profile.ts';
import { readBuildInfo } from '../runtime/build.ts';
import { startupFailure, supportLine } from '../runtime/diagnostics.ts';
import type { StartupStage } from '../runtime/diagnostics.ts';

app.setName('FocusFlow');
app.setAppUserModelId('dev.focusflow.desktop');
const build = readBuildInfo();
console.log(supportLine(build));
let stage: StartupStage = 'profile';
const report = (next: StartupStage) => { stage = next; console.log('FOCUSFLOW_STAGE:' + next); };
let window: BrowserWindow | null = null;
let service: LocalServer | undefined;
let closing = false;
let failed = false;

function fail(error: unknown) {
  if (failed || closing) return;
  failed = true;
  const message = startupFailure(stage, error, build);
  if (process.env.FOCUSFLOW_TEST_PROFILE) console.error(message);
  else dialog.showErrorBox('FocusFlow could not start', message);
  closing = true;
  window?.destroy();
  if (service) void service.close().then(() => app.exit(1), () => app.exit(1));
  else app.exit(1);
}

async function start() {
  if (process.argv.includes('--diagnose')) {
    await app.whenReady(); report('runtime-ready'); app.exit(0); return;
  }
  report('profile');
  const profile = selectProfile({ packaged: app.isPackaged, args: process.argv,
    localDataDirectory: process.env.LOCALAPPDATA ?? app.getPath('appData'),
    checkoutDirectory: app.getAppPath(), schemaVersion: SCHEMA_VERSION,
    testProfile: process.env.FOCUSFLOW_TEST_PROFILE });
  const profileDirectory = profile.directory;
  mkdirSync(profileDirectory, { recursive: true });
  app.setPath('userData', profileDirectory);
  if (!app.requestSingleInstanceLock()) { report('existing-window'); app.quit(); return; }
  app.on('second-instance', () => {
    if (window?.isMinimized()) window.restore();
    window?.show(); window?.focus();
  });
  app.on('before-quit', event => {
    if (closing || !service) return;
    event.preventDefault();
    closing = true;
    report('closing-services');
    window?.destroy();
    void service.close().then(() => { report('services-closed'); app.quit(); }, () => app.exit(1));
  });
  app.on('window-all-closed', () => { if (!closing) app.quit(); });
  app.on('quit', () => report('quit'));
  await app.whenReady();
  report('runtime-ready');
  report('opening-data');
  service = await startWorkspaceServer({ dataDirectory: join(profileDirectory, 'data'),
    sampleLabel: profile.sampleLabel, onLifecycle: report });
  const origin = service.origin;
  report('loading-window');
  window = new BrowserWindow({
    width: 1120, height: 840, minWidth: 800, minHeight: 640, show: false,
    backgroundColor: '#f8f9f6',
    title: profile.sampleLabel ? 'FocusFlow - ' + profile.sampleLabel + ' - Sample data' : 'FocusFlow',
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true },
  });
  window.removeMenu();
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => { if (url !== origin + '/') event.preventDefault(); });
  window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  window.webContents.session.setPermissionCheckHandler(() => false);
  window.webContents.session.on('will-download', event => event.preventDefault());
  window.webContents.on('render-process-gone', () => { if (!closing) fail(new Error('WINDOW_STOPPED')); });
  window.once('ready-to-show', () => { report('window-ready'); window?.show(); });
  window.on('closed', () => { window = null; });
  await window.loadURL(origin);
}
void start().catch(fail);
