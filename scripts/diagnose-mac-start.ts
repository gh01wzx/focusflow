import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { DatabaseSync } from 'node:sqlite';
import { SCHEMA_VERSION } from '../src/database/schema.ts';
import { launchPreview, processStamp, stopPreviewProcess } from '../src/execution/preview-process.ts';
import { localDataDirectory, selectProfile } from '../src/runtime/profile.ts';

// One real source launch with an empty review profile on the disposable hosted Mac.
if (process.platform !== 'darwin' || process.env.RUNNER_ENVIRONMENT !== 'github-hosted') {
  throw new Error('Run the Mac source diagnostic on a disposable GitHub-hosted Mac.');
}
const name = 'mac-start-' + randomUUID();
const cwd = process.cwd();
const profile = selectProfile({ packaged: false, args: ['--review', name], checkoutDirectory: cwd,
  localDataDirectory: localDataDirectory(), schemaVersion: SCHEMA_VERSION });
const { child, stamp } = launchPreview(cwd, 'focusflow', name);
const lines = createInterface({ input: child.stdout });
child.stderr.pipe(process.stderr);
try {
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('The Mac window did not report ready.')), 300_000);
    timeout.unref();
    child.once('error', reject);
    child.once('close', code => {
      clearTimeout(timeout);
      reject(new Error('The Mac launcher exited before readiness: ' + code));
    });
    lines.on('line', line => {
      console.log(line);
      if (line === 'FocusFlow review window ready') { clearTimeout(timeout); resolve(); }
    });
  });
  if (!child.pid || await processStamp(child.pid) !== stamp) throw new Error('Could not confirm the Mac preview process.');
  const db = new DatabaseSync(join(profile.directory, 'data', 'tracker.db'), { readOnly: true });
  try {
    if (db.prepare('PRAGMA user_version').get()?.user_version !== SCHEMA_VERSION) throw new Error('Unexpected review database version.');
  } finally { db.close(); }
  console.log('Native ' + process.arch + ' window read its tasks and opened the named review database.');
} finally {
  lines.close();
  if (child.pid && !await stopPreviewProcess(child.pid, stamp)) throw new Error('Could not confirm preview shutdown.');
}
console.log('Mac source preview stopped.');
