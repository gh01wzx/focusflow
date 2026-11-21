import { parseSomedayItems } from '../shared/someday.ts';

async function request(path: string, body?: unknown) {
  const response = await fetch('/api/someday' + path, body === undefined ? { cache: 'no-store' }
    : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = payload && typeof payload === 'object' && 'error' in payload ? payload.error : undefined;
    throw new Error(typeof error === 'string' ? error : 'Could not reach the local service.');
  }
  return parseSomedayItems(payload);
}

export const readSomeday = () => request('');
export const addSomeday = (title: string) => request('', { title });
export const scheduleSomeday = (id: string, plannedDate: string) => request('/' + encodeURIComponent(id) + '/schedule', { plannedDate });
export const removeSomeday = (id: string) => request('/' + encodeURIComponent(id) + '/remove', {});
