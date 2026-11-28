import { parseCareStatus, parseDataImport, parseDataMove } from '../shared/care.ts';
import type { BackupMode, DataImport, DataMove, DataMoveMode } from '../shared/care.ts';

async function request(path: string, body?: unknown): Promise<unknown> {
  const response = await fetch('/api/care' + path, body === undefined ? { cache: 'no-store' }
    : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = payload && typeof payload === 'object' && 'error' in payload ? payload.error : undefined;
    throw new Error(typeof error === 'string' ? error : 'Could not reach the local service.');
  }
  return payload;
}

export const readCare = async () => parseCareStatus(await request(''));
export const backupNow = async () => parseCareStatus(await request('/backup', {}));
export const chooseBackupFolder = async () => parseCareStatus(await request('/choose-folder', {}));
export const clearBackupFolder = async () => parseCareStatus(await request('/clear-folder', {}));
export const saveCarePreferences = async (change: { loginItem?: boolean; reminders?: boolean; backupMode?: BackupMode }) =>
  parseCareStatus(await request('/preferences', change));
export const revealData = async () => parseCareStatus(await request('/reveal-data', {}));
export const chooseDataFolder = async () => parseDataMove(await request('/data-choose', {}));
export const defaultDataFolder = async () => parseDataMove(await request('/data-default', {}));
export async function moveData(move: DataMove, mode: DataMoveMode): Promise<void> {
  await request('/data-move', { directory: move.directory, mode });
}
export const chooseImport = async () => parseDataImport(await request('/import-choose', {}));
export async function importData(chosen: DataImport): Promise<void> {
  await request('/import', { file: chosen.file });
}
// The written files; empty when the save dialog was closed without a choice.
export async function exportData(format: 'json' | 'csv' | 'file'): Promise<string[]> {
  const result = await request('/export', { format });
  const files = result && typeof result === 'object' && 'files' in result ? result.files : null;
  if (!Array.isArray(files) || !files.every(file => typeof file === 'string')) throw new Error('Could not read the export result.');
  return files;
}
