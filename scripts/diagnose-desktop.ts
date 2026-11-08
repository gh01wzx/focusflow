import { resolve } from 'node:path';
import { diagnoseDesktopRuntime } from '../src/runtime/diagnostic.ts';

if (process.platform !== 'win32') {
  console.error(JSON.stringify({ status: 'failed', reason: 'WINDOWS_DIAGNOSTIC_ONLY' })); process.exitCode = 1;
} else {
  const installed = process.argv[2];
  const executable = installed ? resolve(installed) : resolve('node_modules/electron/dist/electron.exe');
  try {
    const result = await diagnoseDesktopRuntime(executable, installed ? ['--runtime-diagnostic'] : [resolve('.'), '--runtime-diagnostic']);
    console.log(JSON.stringify(result));
    if (result.status !== 'verified') process.exitCode = 1;
  } catch { console.error(JSON.stringify({ status: 'failed', reason: 'DIAGNOSTIC_CLEANUP_FAILED', attempts: 1 })); process.exitCode = 1; }
}
