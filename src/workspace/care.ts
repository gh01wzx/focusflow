import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pruneSnapshots, snapshotsNamed } from '../database/backup.ts';
import type { Snapshot } from '../database/backup.ts';
import { toCsv } from '../database/export.ts';
import { SCHEMA_VERSION } from '../database/schema.ts';
import { localDay } from '../shared/calendar.ts';
import type { CareStatus } from '../shared/care.ts';

// Daily backups kept beside the data, and in the chosen folder.
const DAILY_BACKUPS = 30;
const PREFIX = 'daily-';
const FOLDER_ERROR = 'The backup folder could not be reached. The backup is still saved with your data.';

// What only the desktop app can do. The browser development service has none of them.
export interface DesktopHooks {
  chooseFolder?(): Promise<string | null>;
  reveal?(path: string): void;
  loginItem?: { get(): boolean; set(on: boolean): void };
  notify?(title: string, body: string): void;
}

export interface CareStore {
  snapshot(name?: string): Promise<Snapshot>;
  backupDirectory: string;
  exportTables(): Record<string, unknown[]>;
  exportTaskRows(): Record<string, unknown>[];
  exportPointRows(): Record<string, unknown>[];
  careSettings(): unknown;
  saveCareSettings(value: unknown): void;
}

export class CareInputError extends Error {}

export function createDataCare(store: CareStore, exportsDirectory: string, desktop: DesktopHooks = {}, clock: () => Date = () => new Date()) {
  let folderError = '';
  let queue: Promise<unknown> = Promise.resolve();
  const timers: ReturnType<typeof setTimeout>[] = [];
  // One backup or export at a time, in the order asked.
  function serial<T>(work: () => Promise<T>): Promise<T> {
    const result = queue.then(work, work);
    queue = result.catch(() => {});
    return result;
  }
  function settings(): { backupFolder: string; reminders: boolean } {
    const value = store.careSettings();
    const saved = value && typeof value === 'object' ? value as Record<string, unknown> : {};
    return { backupFolder: typeof saved.backupFolder === 'string' ? saved.backupFolder : '', reminders: saved.reminders !== false };
  }
  async function status(): Promise<CareStatus> {
    const names = await snapshotsNamed(store.backupDirectory, PREFIX);
    // Names are daily-YYYY-MM-DD-<milliseconds>-<id>.db.
    const time = Number(names.at(-1)?.slice(PREFIX.length + 11).split('-')[0]);
    const { backupFolder, reminders } = settings();
    return { lastBackup: Number.isFinite(time) && time > 0 ? new Date(time).toISOString() : null, backups: names.length,
      folder: backupFolder, folderError, canChooseFolder: !!desktop.chooseFolder,
      loginItem: desktop.loginItem ? desktop.loginItem.get() : null, reminders };
  }
  async function backup(): Promise<void> {
    const snapshot = await store.snapshot(PREFIX + localDay(clock()));
    await pruneSnapshots(store.backupDirectory, PREFIX, DAILY_BACKUPS);
    const folder = settings().backupFolder;
    folderError = '';
    if (!folder) return;
    try {
      await mkdir(folder, { recursive: true });
      await copyFile(snapshot.path, join(folder, snapshot.name));
      await copyFile(snapshot.manifestPath, join(folder, snapshot.name + '.json'));
      await pruneSnapshots(folder, PREFIX, DAILY_BACKUPS);
    } catch { folderError = FOLDER_ERROR; }
  }
  // The first backup of each local day. It runs shortly after opening and then hourly, so an app
  // left in the tray across midnight still makes one.
  async function daily(): Promise<void> {
    if ((await snapshotsNamed(store.backupDirectory, PREFIX + localDay(clock()))).length) return;
    await backup();
  }
  function save(change: Partial<{ backupFolder: string; reminders: boolean }>) {
    store.saveCareSettings({ ...settings(), ...change });
  }
  return {
    status,
    reminders: () => settings().reminders,
    schedule() {
      const run = () => { void serial(daily).catch(() => {}); };
      const first = setTimeout(run, 5000), hourly = setInterval(run, 3_600_000);
      first.unref?.(); hourly.unref?.();
      timers.push(first, hourly);
    },
    backupNow: () => serial(backup).then(status),
    async chooseFolder() {
      const folder = await desktop.chooseFolder?.();
      if (!folder) return status();
      save({ backupFolder: folder });
      return serial(backup).then(status);
    },
    clearFolder() {
      save({ backupFolder: '' });
      folderError = '';
      return status();
    },
    setStartup(input: unknown) {
      const value = input && typeof input === 'object' ? input as Record<string, unknown> : {};
      if (value.reminders !== undefined) {
        if (typeof value.reminders !== 'boolean') throw new CareInputError('Choose whether to show reminders.');
        save({ reminders: value.reminders });
      }
      if (value.loginItem !== undefined) {
        if (typeof value.loginItem !== 'boolean' || !desktop.loginItem) throw new CareInputError('Starting at login is available in the Windows desktop app.');
        desktop.loginItem.set(value.loginItem);
      }
      return status();
    },
    // Writes an export beside the data folder and shows it in the desktop app.
    exportData(format: unknown): Promise<{ files: string[] }> {
      if (format !== 'json' && format !== 'csv') throw new CareInputError('Choose JSON or CSV.');
      return serial(async () => {
        const now = clock();
        const stamp = localDay(now) + '-' + String(now.getHours()).padStart(2, '0') + String(now.getMinutes()).padStart(2, '0');
        await mkdir(exportsDirectory, { recursive: true });
        const files: string[] = [];
        if (format === 'json') {
          const path = join(exportsDirectory, `focusflow-${stamp}.json`);
          await writeFile(path, JSON.stringify({ format: 'focusflow-export', version: 1, schemaVersion: SCHEMA_VERSION,
            exportedAt: now.toISOString(), tables: store.exportTables() }, null, 2) + '\n');
          files.push(path);
        } else {
          const tasks = join(exportsDirectory, `focusflow-tasks-${stamp}.csv`), points = join(exportsDirectory, `focusflow-points-${stamp}.csv`);
          await writeFile(tasks, toCsv(store.exportTaskRows(), ['title', 'plannedDate', 'status', 'resolvedAt', 'category', 'repeats']));
          await writeFile(points, toCsv(store.exportPointRows(), ['day', 'loggedAt', 'kind', 'title', 'amount', 'unit', 'pointsPerUnit', 'points']));
          files.push(tasks, points);
        }
        desktop.reveal?.(files[0]!);
        return { files };
      });
    },
    async close() {
      for (const timer of timers) clearTimeout(timer);
      await queue;
    },
  };
}
export type DataCare = ReturnType<typeof createDataCare>;
