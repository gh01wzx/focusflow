import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { startServer } from './server.ts';
import { startTaskServer } from './tasks/server.ts';
import { homedir } from 'node:os';
import { join } from 'node:path';

const spike = process.argv.includes('--spike');
const dataDirectory = process.env.FOCUSFLOW_DATA_DIR
  ? resolve(process.env.FOCUSFLOW_DATA_DIR)
  : spike ? resolve('.phase0', 'data')
  : join(process.env.LOCALAPPDATA ?? join(homedir(), '.local', 'share'), 'FocusFlow', 'desktop', 'data');
const app = await (spike ? startServer : startTaskServer)({ dataDirectory });
console.log(`FocusFlow${spike ? ' persistence spike' : ''}: ${app.origin}`);
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
