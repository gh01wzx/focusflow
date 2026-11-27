import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';

// The everyday profile can keep its task data in another folder, such as a second drive. The choice
// is saved in the profile folder, because the data folder itself is what moves.
const FILE = 'data-location.json';

export function readDataLocation(profileDirectory: string): string | null {
  try {
    const value: unknown = JSON.parse(readFileSync(join(profileDirectory, FILE), 'utf8'));
    const directory = value && typeof value === 'object' ? (value as Record<string, unknown>).directory : undefined;
    return typeof directory === 'string' && isAbsolute(directory) ? directory : null;
  } catch { return null; }
}

// null returns to the default folder.
export function saveDataLocation(profileDirectory: string, directory: string | null): void {
  const path = join(profileDirectory, FILE);
  if (directory === null) { rmSync(path, { force: true }); return; }
  writeFileSync(path + '.tmp', JSON.stringify({ directory }, null, 2) + '\n');
  renameSync(path + '.tmp', path);
}

// A chosen folder is used only while its database is there, so a drive that is not connected never
// opens as a new, empty workspace.
export const dataLocationReady = (directory: string) => existsSync(join(directory, 'tracker.db'));
