import { DatabaseSync } from 'node:sqlite';
import { copyFile, mkdir, readdir, rename, stat, writeFile } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { pruneSnapshots, restoreSnapshot, snapshotsNamed } from '../database/backup.ts';
import type { Snapshot } from '../database/backup.ts';
import { toCsv } from '../database/export.ts';
import { APPLICATION_ID, SCHEMA_VERSION } from '../database/schema.ts';
import { localDay } from '../shared/calendar.ts';
import type { CareStatus, DataMove } from '../shared/care.ts';

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
  // Only the everyday desktop profile can keep its data in another folder. save(null) returns to the
  // default folder; restart reopens the app on the saved folder.
  dataLocation?: { defaultDirectory: string; choose(): Promise<string | null>; save(directory: string | null): void; restart(): void };
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

const DATABASE = 'tracker.db';
const same = (a: string, b: string) => relative(resolve(a), resolve(b)) === '';
const inside = (child: string, parent: string) => {
  const path = relative(resolve(parent), resolve(child));
  return !!path && !path.startsWith('..') && !isAbsolute(path);
};
const changedAt = (directory: string) => stat(join(directory, DATABASE)).then(value => value.mtime.toISOString(), () => null);

// Data in another folder can be used only when it is FocusFlow data this version can open.
function checkExisting(directory: string): void {
  let db: DatabaseSync | undefined;
  try {
    db = new DatabaseSync(join(directory, DATABASE), { readOnly: true });
    const id = db.prepare('PRAGMA application_id').get()?.application_id;
    const version = db.prepare('PRAGMA user_version').get()?.user_version;
    if (id !== APPLICATION_ID) throw new CareInputError('The database in that folder is not FocusFlow data.');
    if (typeof version !== 'number' || version > SCHEMA_VERSION) throw new CareInputError('The data in that folder belongs to a newer FocusFlow version.');
  } catch (error) {
    throw error instanceof CareInputError ? error : new CareInputError('The database in that folder could not be opened.');
  } finally { db?.close(); }
}

export function createDataCare(store: CareStore, paths: { data: string; exports: string }, desktop: DesktopHooks = {}, clock: () => Date = () => new Date()) {
  const exportsDirectory = paths.exports;
  let folderError = '';
  // The folder last chosen for the data. Moving accepts only this folder.
  let pendingMove: DataMove | null = null;
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
      loginItem: desktop.loginItem ? desktop.loginItem.get() : null, reminders,
      dataDirectory: resolve(paths.data), defaultData: !desktop.dataLocation || same(paths.data, desktop.dataLocation.defaultDirectory),
      canMoveData: !!desktop.dataLocation };
  }
  // A folder that already has FocusFlow data is used as it is. An empty folder receives the data; any
  // other folder gets a FocusFlow folder inside it, so the data never mixes with other files.
  async function planMove(folder: string, exact: boolean): Promise<DataMove> {
    if (same(folder, paths.data)) throw new CareInputError('Your data is already in this folder.');
    if (inside(folder, paths.data)) throw new CareInputError('Choose a folder outside the current data folder.');
    const empty = async (directory: string) => (await readdir(directory).catch(() => [] as string[])).length === 0;
    const target = exact || await changedAt(folder) || await empty(folder) ? resolve(folder) : join(resolve(folder), 'FocusFlow');
    const existing = await changedAt(target);
    if (existing) checkExisting(target);
    else if (!same(target, folder) && !await empty(target)) throw new CareInputError('Choose an empty folder, or one with FocusFlow data.');
    pendingMove = { directory: target, existing };
    return pendingMove;
  }
  // Keeps data that is about to be replaced as a backup file in the same folder, with its sidecars.
  async function setAside(directory: string): Promise<void> {
    const backups = join(directory, 'backups');
    await mkdir(backups, { recursive: true });
    const name = 'replaced-' + Date.now() + '.db';
    for (const suffix of ['', '-wal', '-shm', '-journal']) {
      await rename(join(directory, DATABASE + suffix), join(backups, name + suffix)).catch((error: unknown) => {
        if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')) throw error;
      });
    }
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
    async chooseDataFolder(): Promise<DataMove | null> {
      if (!desktop.dataLocation) throw new CareInputError('The data folder can be changed in the everyday desktop app.');
      const folder = await desktop.dataLocation.choose();
      return folder ? planMove(folder, false) : null;
    },
    defaultDataFolder(): Promise<DataMove> {
      if (!desktop.dataLocation) throw new CareInputError('The data folder can be changed in the everyday desktop app.');
      return planMove(desktop.dataLocation.defaultDirectory, true);
    },
    // Copies the data with a verified backup, or switches to data already there, then restarts. The
    // previous folder keeps its copy; data that is replaced is kept as a backup file.
    moveData(input: unknown): Promise<{ restarting: true }> {
      const value = input && typeof input === 'object' ? input as Record<string, unknown> : {};
      const location = desktop.dataLocation, move = pendingMove;
      if (!location || !move || value.directory !== move.directory) throw new CareInputError('Choose the folder again.');
      if (value.mode !== (move.existing ? 'switch' : 'copy') && !(value.mode === 'replace' && move.existing)) {
        throw new CareInputError('Choose how to use this folder.');
      }
      return serial(async () => {
        if (value.mode !== 'switch') {
          const snapshot = await store.snapshot('before-moving');
          if (value.mode === 'replace') await setAside(move.directory);
          await restoreSnapshot(snapshot.path, join(move.directory, DATABASE));
        }
        location.save(same(move.directory, location.defaultDirectory) ? null : move.directory);
        pendingMove = null;
        // The reply reaches the window before the app restarts.
        setTimeout(() => location.restart(), 400).unref?.();
        return { restarting: true as const };
      });
    },
    async close() {
      for (const timer of timers) clearTimeout(timer);
      await queue;
    },
  };
}
export type DataCare = ReturnType<typeof createDataCare>;
