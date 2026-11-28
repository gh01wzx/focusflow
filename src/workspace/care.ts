import { copyFile, mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { pruneSnapshots, restoreSnapshot, snapshotsNamed } from '../database/backup.ts';
import type { Snapshot } from '../database/backup.ts';
import { DATA_FILE, DataFileError, IMPORT_FILE, inspectDataFile, setAside } from '../database/data-file.ts';
import { toCsv } from '../database/export.ts';
import { SCHEMA_VERSION } from '../database/schema.ts';
import { localDay } from '../shared/calendar.ts';
import type { BackupMode, CareStatus, DataImport, DataMove } from '../shared/care.ts';

// Backups kept beside the data, and in the chosen folder.
const KEPT_BACKUPS = 30;
const PREFIX = 'daily-';
const FOLDER_ERROR = 'The backup folder could not be reached. The backup is still saved with your data.';

// What only the desktop app can do. The browser development service has none of them.
export interface DesktopHooks {
  chooseFolder?(): Promise<string | null>;
  // Asks where to save a file with this name, or which FocusFlow data file to open.
  saveFile?(name: string): Promise<string | null>;
  openFile?(): Promise<string | null>;
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

const same = (a: string, b: string) => relative(resolve(a), resolve(b)) === '';
const inside = (child: string, parent: string) => {
  const path = relative(resolve(parent), resolve(child));
  return !!path && !path.startsWith('..') && !isAbsolute(path);
};
const changedAt = (file: string) => stat(file).then(value => value.mtime.toISOString(), () => null);
function inspect(path: string): void {
  try { inspectDataFile(path); } catch (error) { throw new CareInputError(error instanceof DataFileError ? error.message : 'This file could not be opened as FocusFlow data.'); }
}

export function createDataCare(store: CareStore, paths: { data: string; exports: string }, desktop: DesktopHooks = {}, clock: () => Date = () => new Date()) {
  const exportsDirectory = paths.exports;
  let folderError = '';
  // The folder or file last chosen. Moving and importing accept only these.
  let pendingMove: DataMove | null = null;
  let pendingImport: DataImport | null = null;
  let queue: Promise<unknown> = Promise.resolve();
  const timers: ReturnType<typeof setTimeout>[] = [];
  // One backup, export or import at a time, in the order asked.
  function serial<T>(work: () => Promise<T>): Promise<T> {
    const result = queue.then(work, work);
    queue = result.catch(() => {});
    return result;
  }
  function settings(): { backupFolder: string; reminders: boolean; backupMode: BackupMode } {
    const value = store.careSettings();
    const saved = value && typeof value === 'object' ? value as Record<string, unknown> : {};
    return { backupFolder: typeof saved.backupFolder === 'string' ? saved.backupFolder : '', reminders: saved.reminders !== false,
      backupMode: saved.backupMode === 'quit' ? 'quit' : 'daily' };
  }
  async function status(): Promise<CareStatus> {
    const names = await snapshotsNamed(store.backupDirectory, PREFIX);
    // Names are daily-YYYY-MM-DD-<milliseconds>-<id>.db.
    const time = Number(names.at(-1)?.slice(PREFIX.length + 11).split('-')[0]);
    const { backupFolder, reminders, backupMode } = settings();
    return { lastBackup: Number.isFinite(time) && time > 0 ? new Date(time).toISOString() : null, backups: names.length,
      folder: backupFolder, folderError, canChooseFolder: !!desktop.chooseFolder, backupMode,
      loginItem: desktop.loginItem ? desktop.loginItem.get() : null, reminders,
      dataFile: join(resolve(paths.data), DATA_FILE), defaultData: !desktop.dataLocation || same(paths.data, desktop.dataLocation.defaultDirectory),
      canMoveData: !!desktop.dataLocation, canReveal: !!desktop.reveal, canImport: !!desktop.dataLocation && !!desktop.openFile };
  }
  // A folder that already has FocusFlow data is used as it is. An empty folder receives the data; any
  // other folder gets a FocusFlow folder inside it, so the data never mixes with other files.
  async function planMove(folder: string, exact: boolean): Promise<DataMove> {
    if (same(folder, paths.data)) throw new CareInputError('Your data is already in this folder.');
    if (inside(folder, paths.data)) throw new CareInputError('Choose a folder outside the current data folder.');
    const empty = async (directory: string) => (await readdir(directory).catch(() => [] as string[])).length === 0;
    const target = exact || await changedAt(join(folder, DATA_FILE)) || await empty(folder) ? resolve(folder) : join(resolve(folder), 'FocusFlow');
    const existing = await changedAt(join(target, DATA_FILE));
    if (existing) inspect(join(target, DATA_FILE));
    else if (!same(target, folder) && !await empty(target)) throw new CareInputError('Choose an empty folder, or one with FocusFlow data.');
    pendingMove = { directory: target, existing };
    return pendingMove;
  }
  function restart(location: NonNullable<DesktopHooks['dataLocation']>) {
    // The reply reaches the window before the app restarts.
    setTimeout(() => location.restart(), 400).unref?.();
    return { restarting: true as const };
  }
  async function backup(): Promise<void> {
    const snapshot = await store.snapshot(PREFIX + localDay(clock()));
    await pruneSnapshots(store.backupDirectory, PREFIX, KEPT_BACKUPS);
    const folder = settings().backupFolder;
    folderError = '';
    if (!folder) return;
    try {
      await mkdir(folder, { recursive: true });
      await copyFile(snapshot.path, join(folder, snapshot.name));
      await copyFile(snapshot.manifestPath, join(folder, snapshot.name + '.json'));
      await pruneSnapshots(folder, PREFIX, KEPT_BACKUPS);
    } catch { folderError = FOLDER_ERROR; }
  }
  // Daily mode makes the first backup of each local day. It runs shortly after opening and then
  // hourly, so an app left in the tray across midnight still makes one.
  async function daily(): Promise<void> {
    if (settings().backupMode !== 'daily') return;
    if ((await snapshotsNamed(store.backupDirectory, PREFIX + localDay(clock()))).length) return;
    await backup();
  }
  function save(change: Partial<{ backupFolder: string; reminders: boolean; backupMode: BackupMode }>) {
    store.saveCareSettings({ ...settings(), ...change });
  }
  const stamp = () => {
    const now = clock();
    return localDay(now) + '-' + String(now.getHours()).padStart(2, '0') + String(now.getMinutes()).padStart(2, '0');
  };
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
    setPreferences(input: unknown) {
      const value = input && typeof input === 'object' ? input as Record<string, unknown> : {};
      if (value.reminders !== undefined) {
        if (typeof value.reminders !== 'boolean') throw new CareInputError('Choose whether to show reminders.');
        save({ reminders: value.reminders });
      }
      if (value.backupMode !== undefined) {
        if (value.backupMode !== 'daily' && value.backupMode !== 'quit') throw new CareInputError('Choose when to back up.');
        save({ backupMode: value.backupMode });
      }
      if (value.loginItem !== undefined) {
        if (typeof value.loginItem !== 'boolean' || !desktop.loginItem) throw new CareInputError('Starting at login is available in the Windows desktop app.');
        desktop.loginItem.set(value.loginItem);
      }
      return status();
    },
    revealData() {
      desktop.reveal?.(join(resolve(paths.data), DATA_FILE));
      return status();
    },
    // JSON and CSV go to the exports folder. A data file is one complete, verified copy that can be
    // imported again; the desktop app asks where to save it.
    async exportData(format: unknown): Promise<{ files: string[] }> {
      if (format !== 'json' && format !== 'csv' && format !== 'file') throw new CareInputError('Choose JSON, CSV or a data file.');
      const name = `FocusFlow-${stamp()}.focusflow`;
      const target = format !== 'file' ? null : desktop.saveFile ? await desktop.saveFile(name) : join(exportsDirectory, name);
      if (format === 'file' && !target) return { files: [] };
      return serial(async () => {
        await mkdir(exportsDirectory, { recursive: true });
        const files: string[] = [];
        if (target) {
          const snapshot = await store.snapshot('export');
          try { await copyFile(snapshot.path, target); }
          finally { await rm(snapshot.path, { force: true }); await rm(snapshot.manifestPath, { force: true }); }
          files.push(target);
        } else if (format === 'json') {
          const path = join(exportsDirectory, `focusflow-${stamp()}.json`);
          await writeFile(path, JSON.stringify({ format: 'focusflow-export', version: 1, schemaVersion: SCHEMA_VERSION,
            exportedAt: clock().toISOString(), tables: store.exportTables() }, null, 2) + '\n');
          files.push(path);
        } else {
          const tasks = join(exportsDirectory, `focusflow-tasks-${stamp()}.csv`), points = join(exportsDirectory, `focusflow-points-${stamp()}.csv`);
          await writeFile(tasks, toCsv(store.exportTaskRows(), ['title', 'plannedDate', 'status', 'resolvedAt', 'category', 'repeats']));
          await writeFile(points, toCsv(store.exportPointRows(), ['day', 'loggedAt', 'kind', 'title', 'amount', 'unit', 'pointsPerUnit', 'points']));
          files.push(tasks, points);
        }
        desktop.reveal?.(files[0]!);
        return { files };
      });
    },
    // A data file to import: an export, a backup or another profile's tracker.db. It is checked now
    // and confirmed before anything changes.
    async chooseImport(): Promise<DataImport | null> {
      if (!desktop.dataLocation || !desktop.openFile) throw new CareInputError('Data files can be imported in the everyday desktop app.');
      const file = await desktop.openFile();
      if (!file) return null;
      if (same(file, join(paths.data, DATA_FILE))) throw new CareInputError('This is the data file in use.');
      inspect(file);
      pendingImport = { file: resolve(file), changedAt: await changedAt(file) ?? clock().toISOString() };
      return pendingImport;
    },
    // Copies the file beside the data and restarts. At start it takes the data's place, and the
    // current data is kept in backups.
    importData(input: unknown): Promise<{ restarting: true }> {
      const value = input && typeof input === 'object' ? input as Record<string, unknown> : {};
      const location = desktop.dataLocation, chosen = pendingImport;
      if (!location || !chosen || value.file !== chosen.file) throw new CareInputError('Choose the file again.');
      return serial(async () => {
        const staged = join(paths.data, IMPORT_FILE);
        await copyFile(chosen.file, staged);
        try { inspect(staged); } catch (error) { await rm(staged, { force: true }); throw error; }
        pendingImport = null;
        return restart(location);
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
          if (value.mode === 'replace') setAside(move.directory);
          await restoreSnapshot(snapshot.path, join(move.directory, DATA_FILE));
        }
        location.save(same(move.directory, location.defaultDirectory) ? null : move.directory);
        pendingMove = null;
        return restart(location);
      });
    },
    // In quit mode the data is backed up as the app closes, before the database closes.
    async close() {
      for (const timer of timers) clearTimeout(timer);
      if (settings().backupMode === 'quit') await serial(backup).catch(() => {});
      await queue;
    },
  };
}
export type DataCare = ReturnType<typeof createDataCare>;
