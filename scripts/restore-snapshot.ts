import { resolve } from 'node:path';
import { restoreSnapshot } from '../src/database/backup.ts';

const source = process.argv[2];
const destination = process.argv[3];
if (!source || !destination) {
  console.error('Usage: node scripts/restore-snapshot.ts BACKUP_DB NEW_DATABASE_PATH');
  process.exit(2);
}
await restoreSnapshot(resolve(source), resolve(destination));
console.log('Snapshot verified and restored to a new database. The original files were not changed.');
