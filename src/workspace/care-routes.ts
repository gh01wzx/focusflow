import type { DataCare } from './care.ts';

const ROUTES = ['backup', 'choose-folder', 'clear-folder', 'export', 'preferences', 'reveal-data', 'data-choose', 'data-default', 'data-move',
  'import-choose', 'import'] as const;
export type CareRoute = 'status' | typeof ROUTES[number];

export function matchCareRoute(method: string | undefined, path: string): CareRoute | undefined {
  if (method === 'GET' && path === '/api/care') return 'status';
  if (method !== 'POST' || !path.startsWith('/api/care/')) return undefined;
  const name = path.slice('/api/care/'.length);
  return ROUTES.find(route => route === name);
}

export async function dispatchCareRoute(route: CareRoute, input: unknown, care: DataCare): Promise<unknown> {
  const value = input && typeof input === 'object' ? input as Record<string, unknown> : {};
  switch (route) {
    case 'status': return care.status();
    case 'backup': return care.backupNow();
    case 'choose-folder': return care.chooseFolder();
    case 'clear-folder': return care.clearFolder();
    case 'export': return care.exportData(value.format);
    case 'preferences': return care.setPreferences(value);
    case 'reveal-data': return care.revealData();
    case 'data-choose': return care.chooseDataFolder();
    case 'data-default': return care.defaultDataFolder();
    case 'data-move': return care.moveData(value);
    case 'import-choose': return care.chooseImport();
    case 'import': return care.importData(value);
  }
}
