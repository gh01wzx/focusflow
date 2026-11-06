import { existsSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { spawn } from 'node:child_process';
import { readBuildInfo } from '../src/runtime/build.ts';
import { runDesktopOnce } from '../src/runtime/launch.ts';
import { supportLine } from '../src/runtime/diagnostics.ts';
import { validateReviewName } from '../src/runtime/profile.ts';

const root = resolve('.');
const diagnoseOnly = process.argv.includes('--diagnose-only');
const args = process.argv.slice(2).filter(value => value !== '--diagnose-only');
if (args.length === 1 && args[0] === '--review') args.push('local');
if (args.length && (args[0] !== '--review' || args.length !== 2)) {
  console.error('Use npm start, npm run review -- NAME, or npm run diagnose.'); process.exit(2);
}
if (args[1]) {
  try { validateReviewName(args[1]); }
  catch { console.error('Use a review name of up to 48 letters, digits or hyphens.'); process.exit(2); }
}
if (!diagnoseOnly) {
  const npm = process.env.npm_execpath;
  if (!npm || !existsSync(npm)) {
    console.error('Run from npm start or npm run review -- NAME so the app can build first.'); process.exit(2);
  }
  console.log('Preparing the FocusFlow build...');
  const build = spawn(process.execPath, [npm, 'run', 'build'], { cwd: root, windowsHide: true, stdio: 'inherit' });
  const code = await new Promise<number | null>((resolveExit, reject) => {
    build.once('exit', resolveExit); build.once('error', reject);
  }).catch(() => 1);
  if (code !== 0) {
    console.error('FocusFlow did not launch because the build failed. Check the build error above; no Electron process was started.'); process.exit(1);
  }
}
const build = readBuildInfo(new URL('../dist/src/build-info.json', import.meta.url));
console.log(supportLine(build));
const folder = join(root, 'node_modules', 'electron');
let name = process.platform === 'win32' ? 'electron.exe' : 'electron';
try { name = readFileSync(join(folder, 'path.txt'), 'utf8').trim(); } catch { /* Report missing runtime below. */ }
const executable = join(process.env.ELECTRON_OVERRIDE_DIST_PATH ?? join(folder, 'dist'), name);
if (!existsSync(executable)) {
  console.error('Electron runtime missing. Run npm ci, then node node_modules/electron/install.js once. Do not delete task data.'); process.exit(1);
}
console.log(diagnoseOnly ? 'Checking the runtime once without opening task data...' : 'Opening FocusFlow once...');
const result = await runDesktopOnce(executable, [root, ...(diagnoseOnly ? ['--diagnose'] : args)],
  { cwd: root, diagnoseOnly, stage: stage => console.log('Stage: ' + stage) });
console.log(result.message);
process.exitCode = result.ok ? 0 : 1;
