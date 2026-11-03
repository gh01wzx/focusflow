import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { startServer } from './server.ts';

const dataDirectory = process.env.FOCUSFLOW_DATA_DIR
  ? resolve(process.env.FOCUSFLOW_DATA_DIR)
  : resolve('.phase0', 'data');
const app = await startServer({ dataDirectory });
console.log(`FocusFlow Phase 0: ${app.origin}`);
console.log(`Spike data: ${dataDirectory}`);
console.log('Keep this window open. Ctrl+C stops the server. This is not the Tracker MVP.');
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
