import { parseProjectView } from '../shared/project-codec.ts';
import type { EntityDraft, ProjectView, TicketDraft, TicketDetailsDraft, TicketStatus } from '../shared/projects.ts';

export function createProjectClient(transport: typeof fetch = fetch) {
  async function request(path: string, value?: unknown): Promise<ProjectView> {
    const response = await transport(path, value === undefined ? {} : {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value),
    });
    let payload: unknown;
    try { payload = await response.json(); }
    catch { throw new Error('Could not read your projects. Restart FocusFlow and try again.'); }
    if (!response.ok) {
      const error = typeof payload === 'object' && payload !== null && 'error' in payload ? payload.error : undefined;
      throw new Error(typeof error === 'string' ? error : 'Could not save. Please try again.');
    }
    const view = typeof payload === 'object' && payload !== null && 'view' in payload ? payload.view : payload;
    return parseProjectView(view);
  }
  return {
    read: (id?: string) => request('/api/projects' + (id ? `?projectId=${encodeURIComponent(id)}` : '')),
    addProject: (draft: EntityDraft) => request('/api/projects', draft),
    addMilestone: (projectId: string, draft: EntityDraft) => request('/api/milestones', { ...draft, projectId }),
    addTicket: (draft: TicketDraft) => request('/api/project-tickets', draft),
    editProject: (id: string, draft: EntityDraft) => request(`/api/projects/${encodeURIComponent(id)}/details`, draft),
    editMilestone: (id: string, draft: EntityDraft) => request(`/api/milestones/${encodeURIComponent(id)}/details`, draft),
    editTicket: (id: string, draft: TicketDetailsDraft) => request(`/api/project-tickets/${encodeURIComponent(id)}/details`, draft),
    setStatus: (id: string, status: TicketStatus) => request(`/api/project-tickets/${encodeURIComponent(id)}/status`, { status }),
  };
}
