import type { ProjectService } from './service.ts';

type ProjectRoute =
  | { kind: 'view'; projectId?: string }
  | { kind: 'addProject' | 'addMilestone' | 'addTicket' }
  | { kind: 'setStatus'; id: string };

export function matchProjectRoute(method: string | undefined, path: string): ProjectRoute | undefined {
  if (method === 'GET') {
    const match = /^\/api\/projects(?:\?projectId=([a-f0-9-]{36}))?$/.exec(path);
    if (match) return match[1] ? { kind: 'view', projectId: match[1] } : { kind: 'view' };
  }
  if (method !== 'POST') return undefined;
  if (path === '/api/projects') return { kind: 'addProject' };
  if (path === '/api/milestones') return { kind: 'addMilestone' };
  if (path === '/api/project-tickets') return { kind: 'addTicket' };
  const match = /^\/api\/project-tickets\/([a-f0-9-]{36})\/status$/.exec(path);
  return match?.[1] ? { kind: 'setStatus', id: match[1] } : undefined;
}
export function dispatchProjectRoute(route: ProjectRoute, input: unknown, service: ProjectService) {
  switch (route.kind) {
    case 'view': return { status: 200, body: service.view(route.projectId) };
    case 'addProject': {
      const project = service.addProject(input);
      return { status: 201, body: { view: service.view(project.id) } };
    }
    case 'addMilestone': {
      const milestone = service.addMilestone(input);
      return { status: 201, body: { view: service.view(milestone.projectId) } };
    }
    case 'addTicket': {
      const ticket = service.addTicket(input);
      return { status: 201, body: { view: service.view(ticket.projectId) } };
    }
    case 'setStatus': {
      const status = typeof input === 'object' && input !== null && 'status' in input ? input.status : undefined;
      const projectId = service.setStatus(route.id, status);
      return { status: 200, body: { view: service.view(projectId) } };
    }
  }
}
