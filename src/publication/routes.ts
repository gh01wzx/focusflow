import type { createPublicationService } from './service.ts';

export function matchPublicationRoute(method: string | undefined, path: string) {
  const match = /^\/api\/projects\/([a-f0-9-]{36})\/publication(?:\/(preview|publish|abandon))?$/.exec(path);
  if (!match?.[1] || (match[2] ? method !== 'POST' : method !== 'GET')) return undefined;
  return { projectId: match[1], action: match[2] ?? 'state' };
}
export async function dispatchPublicationRoute(route: NonNullable<ReturnType<typeof matchPublicationRoute>>, input: unknown, service: ReturnType<typeof createPublicationService>) {
  if (route.action === 'preview') return service.preview(route.projectId);
  if (route.action === 'publish') return service.start(route.projectId, input);
  if (route.action === 'abandon') return service.abandon(route.projectId, input);
  return service.state(route.projectId);
}
