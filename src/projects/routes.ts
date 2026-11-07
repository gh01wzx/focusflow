import type { ProjectService } from './service.ts';

type ProjectRoute =
  | { kind: 'actions' }
  | { kind: 'start'; id: string }
  | { kind: 'prerequisites'; id: string }
  | { kind: 'view'; projectId?: string }
  | { kind: 'addProject' | 'addMilestone' | 'addTicket' }
  | { kind: 'editProject' | 'editMilestone' | 'editTicket'; id: string }
  | { kind: 'setStatus'; id: string };

export function matchProjectRoute(method: string | undefined, path: string): ProjectRoute | undefined {
  if (method === 'GET' && path === '/api/project-actions') return { kind: 'actions' };
  if (method === 'GET') {
    const match = /^\/api\/projects(?:\?projectId=([a-f0-9-]{36}))?$/.exec(path);
    if (match) return match[1] ? { kind: 'view', projectId: match[1] } : { kind: 'view' };
  }
  if (method !== 'POST') return undefined;
  if (path === '/api/projects') return { kind: 'addProject' };
  if (path === '/api/milestones') return { kind: 'addMilestone' };
  if (path === '/api/project-tickets') return { kind: 'addTicket' };
  const prerequisites = /^\/api\/project-tickets\/([a-f0-9-]{36})\/prerequisites$/.exec(path);
  if (prerequisites?.[1]) return { kind: 'prerequisites', id: prerequisites[1] };
  const edit = /^\/api\/(projects|milestones|project-tickets)\/([a-f0-9-]{36})\/details$/.exec(path);
  if (edit?.[2]) return {
    kind: edit[1] === 'projects' ? 'editProject' : edit[1] === 'milestones' ? 'editMilestone' : 'editTicket', id: edit[2],
  };
  const start = /^\/api\/project-tickets\/([a-f0-9-]{36})\/start$/.exec(path);
  if (start?.[1]) return { kind: 'start', id: start[1] };
  const match = /^\/api\/project-tickets\/([a-f0-9-]{36})\/status$/.exec(path);
  return match?.[1] ? { kind: 'setStatus', id: match[1] } : undefined;
}
export function dispatchProjectRoute(route: ProjectRoute, input: unknown, service: ProjectService) {
  switch (route.kind) {
    case 'prerequisites': {
      const id = service.setPrerequisites(route.id, input);
      return { status: 200, body: { view: service.view(id) } };
    }
    case 'editProject':
    case 'editMilestone':
    case 'editTicket': {
      const projectId = service[route.kind](route.id, input);
      return { status: 200, body: { view: service.view(projectId) } };
    }
    case 'actions': return { status: 200, body: service.actions() };
    case 'start': {
      service.start(route.id);
      return { status: 200, body: service.actions() };
    }
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
