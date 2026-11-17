import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { startWorkspaceServer } from './workspace/server.ts';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { SCHEMA_VERSION } from './database/schema.ts';
import { localDataDirectory, selectProfile } from './runtime/profile.ts';
import { createAiService } from './ai/service.ts';
import { createAiRuntime } from './ai/runtime.ts';

const dataRoot = localDataDirectory(join(homedir(), '.local', 'share'));
const profile = selectProfile({ packaged: false, args: process.argv,
  localDataDirectory: dataRoot,
  checkoutDirectory: fileURLToPath(new URL('../..', import.meta.url)), schemaVersion: SCHEMA_VERSION });
const customData = !process.argv.includes('--review') && process.env.FOCUSFLOW_DATA_DIR;
const dataDirectory = customData
  ? resolve(customData)
  : join(profile.directory, 'data');
const ai = createAiService(createAiRuntime(dataRoot,
  false, customData ? dataDirectory : profile.directory));
const app = await startWorkspaceServer({ dataDirectory, workspaceLabel: customData ? null : profile.workspaceLabel, ai });
console.log(`FocusFlow: ${app.origin}`);
console.log(`Local data: ${dataDirectory}`);
console.log('Keep this window open. Ctrl+C stops the server.');
if (process.argv.includes('--open') && (process.platform === 'win32' || process.platform === 'darwin')) {
  const browser = process.platform === 'darwin'
    ? spawn('/usr/bin/open', [app.origin], { stdio: 'ignore' })
    : spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', `Start-Process '${app.origin}'`], { windowsHide: true, stdio: 'ignore' });
  browser.on('error', () => console.log('Open the local URL above in your browser.'));
}
let closing = false;
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => {
  if (closing) return;
  closing = true;
  await app.close();
  process.exit(0);
});
