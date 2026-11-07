import { parsePublicationState } from '../shared/publication.ts';

export function createPublicationClient(transport: typeof fetch = fetch) {
  async function request(projectId: string, action = '', input?: unknown) {
    const response = await transport('/api/projects/' + projectId + '/publication' + action, input === undefined ? {} : {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
    });
    const body: unknown = await response.json();
    if (!response.ok) throw new Error(body && typeof body === 'object' && 'error' in body && typeof body.error === 'string' ? body.error : 'Could not read publication results.');
    const state = parsePublicationState(body);
    if (state.batch && state.batch.projectId !== projectId) throw new Error('Publication belongs to another project.');
    return state;
  }
  return { read: (projectId: string) => request(projectId), preview: (projectId: string) => request(projectId, '/preview', {}),
    publish: (projectId: string, batchId: string, confirm: boolean) => request(projectId, '/publish', { batchId, confirm }),
    abandon: (projectId: string, batchId: string) => request(projectId, '/abandon', { batchId, confirm: true }) };
}
