import { parseProjectView } from '../shared/project-codec.ts';
import type { ProjectView } from '../shared/projects.ts';
export function createActionClient(transport: typeof fetch = fetch) {
  async function request(id?: string): Promise<ProjectView[]> {
    const response = await transport(id ? `/api/project-tickets/${encodeURIComponent(id)}/start` : '/api/project-actions',
      id ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' } : {});
    const payload: unknown = await response.json();
    if (!response.ok) {
      const error = typeof payload === 'object' && payload !== null && 'error' in payload ? payload.error : undefined;
      throw new Error(typeof error === 'string' ? error : 'Could not load project actions.');
    }
    if (!Array.isArray(payload)) throw new Error('Could not read project actions.');
    const views = payload.map(parseProjectView);
    if (views.some(v => v.projects.length !== 1 || v.selectedProjectId !== v.projects[0]?.id)
      || new Set(views.map(v => v.selectedProjectId)).size !== views.length) throw new Error('Could not read project actions.');
    return views;
  }
  return { read: () => request(), start: (id: string) => request(id) };
}
