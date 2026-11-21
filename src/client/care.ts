import { parseCareStatus } from '../shared/care.ts';

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
export const saveStartup = async (change: { loginItem?: boolean; reminders?: boolean }) => parseCareStatus(await request('/startup', change));
export async function exportData(format: 'json' | 'csv'): Promise<string[]> {
  const result = await request('/export', { format });
  const files = result && typeof result === 'object' && 'files' in result ? result.files : null;
  if (!Array.isArray(files) || !files.every(file => typeof file === 'string')) throw new Error('Could not read the export result.');
  return files;
}
