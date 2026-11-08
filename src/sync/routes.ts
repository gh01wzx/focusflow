import type { createLinkedWorkService } from './service.ts';

export function matchLinkedWorkRoute(method: string | undefined, path: string) {
  const match = /^\/api\/project-tickets\/([a-f0-9-]{36})\/linked-work(?:\/(refresh|edit|accept-remote|link-pr))?$/.exec(path);
  if (!match?.[1] || (match[2] ? method !== 'POST' : method !== 'GET')) return undefined;
  return { ticketId: match[1], action: match[2] ?? 'state' };
}
export function dispatchLinkedWorkRoute(route: NonNullable<ReturnType<typeof matchLinkedWorkRoute>>, input: unknown, service: ReturnType<typeof createLinkedWorkService>) {
  if (route.action === 'refresh') return service.refresh(route.ticketId);
  if (route.action === 'edit') return service.edit(route.ticketId, input);
  if (route.action === 'accept-remote') return service.acceptRemote(route.ticketId, input);
  if (route.action === 'link-pr') return service.linkPull(route.ticketId, input);
  return service.state(route.ticketId);
}
