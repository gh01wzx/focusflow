import type { GitHubService } from './service.ts';
import { unavailableGitHub } from '../shared/github.ts';
import { HttpError } from '../http/request.ts';

export function matchGitHubRoute(method: string | undefined, path: string) {
  const match = /^\/api\/projects\/([a-f0-9-]{36})\/github(?:\/(start|poll|cancel|check|inspect|connect|disconnect))?$/.exec(path);
  if (!match || (match[2] ? method !== 'POST' : method !== 'GET')) return undefined;
  return { projectId: match[1]!, action: match[2] ?? 'status' };
}
export async function dispatchGitHubRoute(route: { projectId: string; action: string }, input: unknown, service?: GitHubService) {
  if (!service) return { ...unavailableGitHub };
  const value = input && typeof input === 'object' ? input as Record<string, unknown> : {};
  const id = route.projectId;
  switch (route.action) {
    case 'status': return service.status(id);
    case 'start': return service.start(id, value.clientId);
    case 'poll': return service.poll(id);
    case 'cancel': return service.cancel(id);
    case 'check': return service.check(id);
    case 'inspect': return service.inspect(id, value.name);
    case 'connect': return service.connect(id, value.confirmed, value.repositoryId);
    case 'disconnect': return service.disconnect(id);
    default: throw new HttpError(404, 'Not found');
  }
}
