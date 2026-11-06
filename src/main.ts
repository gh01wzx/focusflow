import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { startWorkspaceServer } from './workspace/server.ts';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { SCHEMA_VERSION } from './database/schema.ts';
import { selectProfile } from './runtime/profile.ts';
import { createAiService } from './ai/service.ts';
import { createAiRuntime } from './ai/runtime.ts';

const profile = selectProfile({ packaged: false, args: process.argv,
  localDataDirectory: process.env.LOCALAPPDATA ?? join(homedir(), '.local', 'share'),
  checkoutDirectory: fileURLToPath(new URL('../..', import.meta.url)), schemaVersion: SCHEMA_VERSION });
const customData = !process.argv.includes('--review') && process.env.FOCUSFLOW_DATA_DIR;
const dataDirectory = customData
  ? resolve(customData)
  : join(profile.directory, 'data');
const ai = createAiService(createAiRuntime(process.env.LOCALAPPDATA ?? join(homedir(), '.local', 'share')));
const app = await startWorkspaceServer({ dataDirectory, sampleLabel: customData ? null : profile.sampleLabel, ai });
console.log(`FocusFlow: ${app.origin}`);
console.log(`Local data: ${dataDirectory}`);
console.log('Keep this window open. Ctrl+C stops the server.');
if (process.argv.includes('--open') && process.platform === 'win32') {
  const browser = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', `Start-Process '${app.origin}'`], { windowsHide: true, stdio: 'ignore' });
  browser.on('error', () => console.log('Open the local URL above in your browser.'));
}
let closing = false;
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => {
  if (closing) return;
  closing = true;
  await app.close();
  process.exit(0);
});
