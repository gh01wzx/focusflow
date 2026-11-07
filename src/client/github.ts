import { parseGitHubStatus } from '../shared/github.ts';
export function createGitHubClient(transport: typeof fetch = fetch) {
  async function request(projectId: string, action?: string, value: unknown = {}) {
    const response = await transport('/api/projects/' + encodeURIComponent(projectId) + '/github' + (action ? '/' + action : ''), action ? {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value),
    } : {});
    let payload: unknown;
    try { payload = await response.json(); } catch { throw new Error('Could not read GitHub connection. Retry later.'); }
    if (!response.ok) {
      const error = payload && typeof payload === 'object' && 'error' in payload ? payload.error : null;
      throw new Error(typeof error === 'string' ? error : 'Could not change GitHub connection.');
    }
    return parseGitHubStatus(payload);
  }
  return { read: (projectId: string) => request(projectId),
    act: (projectId: string, action: string, value?: unknown) => request(projectId, action, value) };
}
