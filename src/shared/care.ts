// Backups, export, start at login and reminders: the long-term care of a personal profile.
export interface CareStatus {
  // When the newest daily backup was made, or null before the first one.
  lastBackup: string | null;
  backups: number;
  // A folder that also receives each backup, for example one a cloud drive syncs. Empty for none.
  folder: string;
  folderError: string;
  canChooseFolder: boolean;
  // Whether FocusFlow starts in the tray at login, or null where that is not available.
  loginItem: boolean | null;
  reminders: boolean;
}

export function parseCareStatus(value: unknown): CareStatus {
  const record = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  if ((record.lastBackup !== null && typeof record.lastBackup !== 'string') || typeof record.backups !== 'number'
    || typeof record.folder !== 'string' || typeof record.folderError !== 'string' || typeof record.canChooseFolder !== 'boolean'
    || (record.loginItem !== null && typeof record.loginItem !== 'boolean') || typeof record.reminders !== 'boolean') {
    throw new Error('Could not read backup and reminder settings.');
  }
  return record as unknown as CareStatus;
}
