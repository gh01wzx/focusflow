import type { DataCare } from './care.ts';

export type CareRoute = 'status' | 'backup' | 'choose-folder' | 'clear-folder' | 'export' | 'startup';

export function matchCareRoute(method: string | undefined, path: string): CareRoute | undefined {
  if (method === 'GET' && path === '/api/care') return 'status';
  if (method !== 'POST') return undefined;
  return /^\/api\/care\/(backup|choose-folder|clear-folder|export|startup)$/.exec(path)?.[1] as CareRoute | undefined;
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
  }
}
