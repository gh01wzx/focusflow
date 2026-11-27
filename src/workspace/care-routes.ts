import type { DataCare } from './care.ts';

export type CareRoute = 'status' | 'backup' | 'choose-folder' | 'clear-folder' | 'export' | 'startup' | 'data-choose' | 'data-default' | 'data-move';

export function matchCareRoute(method: string | undefined, path: string): CareRoute | undefined {
  if (method === 'GET' && path === '/api/care') return 'status';
  if (method !== 'POST') return undefined;
  return /^\/api\/care\/(backup|choose-folder|clear-folder|export|startup|data-choose|data-default|data-move)$/.exec(path)?.[1] as CareRoute | undefined;
}

export async function dispatchCareRoute(route: CareRoute, input: unknown, care: DataCare): Promise<unknown> {
  const value = input && typeof input === 'object' ? input as Record<string, unknown> : {};
  switch (route) {
    case 'status': return care.status();
    case 'backup': return care.backupNow();
    case 'choose-folder': return care.chooseFolder();
    case 'clear-folder': return care.clearFolder();
    case 'export': return care.exportData(value.format);
    case 'startup': return care.setStartup(value);
    case 'data-choose': return care.chooseDataFolder();
    case 'data-default': return care.defaultDataFolder();
    case 'data-move': return care.moveData(value);
  }
}
