import { parsePlanState } from '../shared/plans.ts';

export function createPlanClient(transport: typeof fetch = fetch) {
  async function request(projectId: string, action = '', input?: unknown) {
    const response = await transport('/api/projects/' + projectId + '/plan-draft' + action, input === undefined ? {} : {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
    });
    if (!response.ok) {
      const value: unknown = await response.json().catch(() => null);
      const message = value && typeof value === 'object' && 'error' in value && typeof value.error === 'string' ? value.error : 'Could not open the local plan draft.';
      throw new Error(message);
    }
    const result = parsePlanState(await response.json());
    if (result.draft && result.draft.projectId !== projectId) throw new Error('The draft belongs to another project.');
    return result;
  }
  return { read: (projectId: string) => request(projectId),
    generate: (projectId: string, goal: string, confirmAllowance: boolean) => request(projectId, '/generate', { goal, confirmAllowance }),
    cancel: (projectId: string) => request(projectId, '/cancel', {}) };
}
