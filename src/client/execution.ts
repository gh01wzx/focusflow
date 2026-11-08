import { parseWorkspaceState } from '../shared/execution.ts';

export function createCodingClient(transport: typeof fetch = fetch) {
  async function request(id: string, action = '', input?: unknown) {
    const response = await transport('/api/project-tickets/' + id + '/coding' + (action ? '/' + action : ''), input === undefined ? {} : {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
    });
    const body: unknown = await response.json();
    if (!response.ok) throw new Error(body && typeof body === 'object' && 'error' in body && typeof body.error === 'string' ? body.error : 'The coding action could not complete.');
    return parseWorkspaceState(body, id);
  }
  return { read: (id: string) => request(id), act: (id: string, action: string, input: unknown) => request(id, action, input) };
}
