import { app, BrowserWindow, dialog, safeStorage, shell } from 'electron';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { startWorkspaceServer } from '../workspace/server.ts';
import type { LocalServer } from '../http/local-server.ts';
import { MigrationError, NewerDatabaseError } from '../database/migrate.ts';
import { SCHEMA_VERSION } from '../database/schema.ts';
import { localDataDirectory, selectProfile } from '../runtime/profile.ts';
import { createAiService } from '../ai/service.ts';
import { createAiRuntime } from '../ai/runtime.ts';
import { createProviderCredential } from '../ai/credential.ts';
import type { CredentialCrypto } from '../github/vault.ts';
import { createCompatibleService } from '../ai/compatible.ts';
import { createDshService } from '../ai/dsh.ts';
import { AI_SETUP_URL, isAiSignInUrl } from '../shared/ai.ts';

import { createGitHubVault } from '../github/vault.ts';
import { createGitHubService } from '../github/service.ts';
import { isGitHubIssueUrl, isGitHubPullUrl, isGitHubEvidenceUrl } from '../shared/github.ts';
import { awaitInterfaceReady, StartupFailure } from '../runtime/startup.ts';
import { RUNTIME_MARKER } from '../runtime/diagnostic.ts';
import { keepInTray } from './tray.ts';

let window: BrowserWindow | null = null;
let service: LocalServer | undefined;
let tray: ReturnType<typeof keepInTray> | undefined;

app.setName('FocusFlow');
if (process.platform === 'win32') app.setAppUserModelId('dev.focusflow.desktop');
if (process.argv.includes('--runtime-diagnostic')) {
  void app.whenReady().then(() => { console.log(RUNTIME_MARKER); app.exit(0); }, () => app.exit(1));
} else {
  void startDesktop();
}

async function startDesktop(): Promise<void> {
  let preparingProfile = true;
  try {
    const dataRoot = localDataDirectory(app.getPath('appData'));
    const profile = selectProfile({ packaged: app.isPackaged, args: process.argv,
      localDataDirectory: dataRoot,
      checkoutDirectory: app.getAppPath(), schemaVersion: SCHEMA_VERSION,
      testProfile: process.env.FOCUSFLOW_TEST_PROFILE });
    const profileDirectory = profile.directory;
    mkdirSync(profileDirectory, { recursive: true });
    app.setPath('userData', profileDirectory);

    let closing = false;
    let interfaceReady = false;
    const traceShutdown = (stage: string) => {
      if (process.env.FOCUSFLOW_SHUTDOWN_TRACE === '1') console.log('FOCUSFLOW_SHUTDOWN:' + stage);
    };

    if (!app.requestSingleInstanceLock()) {
      app.quit();
    } else {
      preparingProfile = false;
      app.on('second-instance', () => {
        if (!interfaceReady) return;
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
        tray?.destroy();
        window?.destroy();
        void service.close().then(() => { traceShutdown('desktop:complete'); app.quit(); },
          () => { traceShutdown('desktop:failed'); app.exit(1); });
      });
      app.on('window-all-closed', () => { if (!closing) app.quit(); });

      await app.whenReady();
      let confirmReady!: () => void;
      const ready = new Promise<void>(resolve => { confirmReady = resolve; });
      const ai = createAiService(createAiRuntime(dataRoot, true, profileDirectory));
      const crypto: CredentialCrypto = {
        available: async () => (process.platform === 'win32' || process.platform === 'darwin') && await safeStorage.isAsyncEncryptionAvailable(),
        encrypt: value => safeStorage.encryptStringAsync(value),
        decrypt: async value => (await safeStorage.decryptStringAsync(value)).result,
      };
      const github = createGitHubService(createGitHubVault(join(profileDirectory, 'github'), crypto));
      const dsh = createDshService(createProviderCredential(join(profileDirectory, 'ai'), crypto));
      const compatible = createCompatibleService(createProviderCredential(join(profileDirectory, 'ai'), crypto, 'compatible'));
      const namedApis = {
        openai: createCompatibleService(createProviderCredential(join(profileDirectory, 'ai'), crypto, 'openai'), 'openai'),
        claude: createCompatibleService(createProviderCredential(join(profileDirectory, 'ai'), crypto, 'claude'), 'claude'),
        deepseek: createCompatibleService(createProviderCredential(join(profileDirectory, 'ai'), crypto, 'deepseek-api'), 'deepseek'),
      };
      service = await startWorkspaceServer({ dataDirectory: join(profileDirectory, 'data'), workspaceLabel: profile.workspaceLabel,
        github, ai, dsh, compatible, namedApis, onShutdown: traceShutdown, onInterfaceReady: confirmReady, appVersion: app.getVersion() });
      // Saved API keys only need decrypting, so those connections are usable at once. The Codex and
      // DeepSeek Harness checks each start a separate runtime process, so they wait until the first
      // screen has settled and run one at a time instead of competing with it.
      void ready.then(() => Promise.allSettled([compatible.restore(), ...Object.values(namedApis).map(api => api.restore())]));
      void ready.then(async () => {
        await new Promise(resolve => setTimeout(resolve, 3000));
        const checks: (() => Promise<unknown>)[] = [() => ai.check(), () => dsh.restore()];
        for (const check of checks) {
          if (closing) return;
          await check().catch(() => {});
        }
      });
      const origin = service.origin;
      window = new BrowserWindow({
        width: 1120,
        height: 840,
        minWidth: 800,
        minHeight: 640,
        show: false,
        backgroundColor: '#f8f9f6',
        title: profile.workspaceLabel ? `FocusFlow - ${profile.workspaceLabel} - Separate workspace` : 'FocusFlow',
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
          webSecurity: true,
        },
      });
      if (process.platform !== 'darwin') window.removeMenu();
      window.webContents.setWindowOpenHandler(({ url }) => {
        if (/^http:\/\/127\.0\.0\.1:\d{1,5}\/$/.test(url) || url === AI_SETUP_URL || isAiSignInUrl(url) || isGitHubIssueUrl(url) || isGitHubPullUrl(url) || isGitHubEvidenceUrl(url) ||
            ['https://github.com/login/device', 'https://github.com/settings/apps', 'https://github.com/settings/personal-access-tokens/new'].includes(url)) {
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
      // Signing out or shutting down Windows quits instead of hiding to the tray.
      window.on('session-end', () => app.quit());
      // Automated previews close normally, so stopping a preview never leaves a hidden app.
      if (process.env.FOCUSFLOW_PREVIEW_READY !== '1') {
        tray = keepInTray(window, { origin, title: profile.workspaceLabel ? `FocusFlow - ${profile.workspaceLabel}` : 'FocusFlow',
          onQuit: () => app.quit() });
      }
      // Clicking the Dock icon on a Mac brings the hidden window back.
      app.on('activate', () => tray?.show());
      await awaitInterfaceReady(() => window!.loadURL(origin), ready);
      interfaceReady = true;
      window?.show();
      if (profile.workspaceLabel && process.env.FOCUSFLOW_PREVIEW_READY === '1') console.log('FocusFlow review window ready');
    }
  } catch (error: unknown) {
    const message = preparingProfile
      ? 'FocusFlow could not prepare its data profile. Check the review name, conflicting launch settings and write access. Keep existing data; do not reset or delete the profile.'
      : error instanceof NewerDatabaseError
      ? 'This data belongs to a newer app version. Open that version, or restore a verified backup to a separate location before using an older version.'
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
  }
}
