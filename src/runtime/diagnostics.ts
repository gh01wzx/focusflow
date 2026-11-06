import type { BuildInfo } from '../shared/build.ts';
import { MigrationError, NewerDatabaseError } from '../database/migrate.ts';

export const STARTUP_STAGES = ['profile', 'runtime-ready', 'opening-data', 'loading-window', 'window-ready', 'existing-window',
  'closing-services', 'draining-requests', 'connections-closed', 'store-closed', 'services-closed', 'quit'] as const;
export type StartupStage = typeof STARTUP_STAGES[number];
export function supportLine(build: BuildInfo) {
  return 'FocusFlow ' + build.version + ' / commit ' + build.commit + (build.dirty ? ' (local changes)' : '') + ' / data format ' + build.schema;
}
export function startupFailure(stage: StartupStage, error: unknown, build: BuildInfo) {
  const detail = error instanceof NewerDatabaseError
    ? 'This task data belongs to a newer app. Use a compatible newer version. To try separate sample data, run FocusFlow.exe --review startup-check.'
    : error instanceof MigrationError
    ? 'The task-data upgrade failed and was rolled back. Keep the data directory and backups. Use a compatible app or restore a verified backup to a separate path.'
    : stage === 'profile'
    ? 'The data profile could not be prepared. Check the review name and data-folder access. Use a short review name with letters, digits and hyphens.'
    : stage === 'loading-window' || stage === 'window-ready'
    ? 'The application window could not load. Keep your task data. Record this build and stage, then report the failure.'
    : 'Task data could not be opened. Keep the data directory and backups. Check free space and folder access before retrying.';
  return detail + '\nStage: ' + stage + '.\n' + supportLine(build);
}
export function exitExplanation(code: number | null, signal: string | null, ready: boolean) {
  const exit = code === null ? 'no exit code' : '0x' + (code >>> 0).toString(16).padStart(8, '0').toUpperCase();
  if (code === 0 && ready) return 'FocusFlow closed normally.';
  return 'The ' + (ready ? 'application' : 'Electron runtime') + ' stopped with ' + exit + (signal ? ' after a stop signal' : '')
    + '. Stop repeated launches. Keep the build/stage information and report the result; this code alone does not identify a permission or runtime-file cause.';
}
