// Backups, export, start at login, reminders and the data file: the long-term care of a personal profile.
export type BackupMode = 'daily' | 'quit';
export interface CareStatus {
  // When the newest backup was made, or null before the first one.
  lastBackup: string | null;
  backups: number;
  // Once a day, or each time the app quits.
  backupMode: BackupMode;
  // A folder that also receives each backup, for example one a cloud drive syncs. Empty for none.
  folder: string;
  folderError: string;
  canChooseFolder: boolean;
  // Whether FocusFlow starts in the tray at login, or null where that is not available.
  loginItem: boolean | null;
  reminders: boolean;
  // The data file in use, and what the everyday desktop app can do with it.
  dataFile: string;
  defaultData: boolean;
  canMoveData: boolean;
  canReveal: boolean;
  canImport: boolean;
}

// A folder chosen for the data, before it is used. `existing` is when the FocusFlow data already
// there last changed, or null when the folder has none.
export interface DataMove { directory: string; existing: string | null }
export type DataMoveMode = 'copy' | 'switch' | 'replace';
// A checked data file chosen for import, before it replaces the current data.
export interface DataImport { file: string; changedAt: string }

export function parseCareStatus(value: unknown): CareStatus {
  const record = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  if ((record.lastBackup !== null && typeof record.lastBackup !== 'string') || typeof record.backups !== 'number'
    || (record.backupMode !== 'daily' && record.backupMode !== 'quit')
    || typeof record.folder !== 'string' || typeof record.folderError !== 'string' || typeof record.canChooseFolder !== 'boolean'
    || (record.loginItem !== null && typeof record.loginItem !== 'boolean') || typeof record.reminders !== 'boolean'
    || typeof record.dataFile !== 'string' || typeof record.defaultData !== 'boolean' || typeof record.canMoveData !== 'boolean'
    || typeof record.canReveal !== 'boolean' || typeof record.canImport !== 'boolean') {
    throw new Error('Could not read backup and reminder settings.');
  }
  return record as unknown as CareStatus;
}

// null when the folder dialog was closed without a choice.
export function parseDataMove(value: unknown): DataMove | null {
  if (value === null) return null;
  const record = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  if (typeof record.directory !== 'string' || (record.existing !== null && typeof record.existing !== 'string')) {
    throw new Error('Could not read the chosen data folder.');
  }
  return { directory: record.directory, existing: record.existing };
}

// null when the file dialog was closed without a choice.
export function parseDataImport(value: unknown): DataImport | null {
  if (value === null) return null;
  const record = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  if (typeof record.file !== 'string' || typeof record.changedAt !== 'string') throw new Error('Could not read the chosen data file.');
  return { file: record.file, changedAt: record.changedAt };
}
