import { parseLinkedWorkState } from '../shared/linked-work.ts';

export function createLinkedWorkClient(transport: typeof fetch = fetch) {
  async function request(ticketId: string, action = '', input?: unknown) {
    const response = await transport('/api/project-tickets/' + ticketId + '/linked-work' + action, input === undefined ? {} : {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
    });
    const body: unknown = await response.json();
    if (!response.ok) throw new Error(body && typeof body === 'object' && 'error' in body && typeof body.error === 'string' ? body.error : 'Could not read linked work.');
    const state = parseLinkedWorkState(body);
    if (state.ticketId !== ticketId) throw new Error('Linked work belongs to another ticket.');
    return state;
  }
  return { read: (id: string) => request(id), act: (id: string, action: string, input: unknown = {}) => request(id, '/' + action, input) };
}
