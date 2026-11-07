import type { createPlanService } from './service.ts';

export function matchPlanRoute(method: string | undefined, path: string) {
  const match = /^\/api\/projects\/([a-f0-9-]{36})\/plan-draft(?:\/(generate|cancel|edit|approve))?$/.exec(path);
  if (!match?.[1]) return undefined;
  if (method === 'GET' && !match[2]) return { projectId: match[1], action: 'status' as const };
  if (method === 'POST' && (match[2] === 'generate' || match[2] === 'cancel' || match[2] === 'edit' || match[2] === 'approve')) return { projectId: match[1], action: match[2] };
  return undefined;
}
export function dispatchPlanRoute(route: NonNullable<ReturnType<typeof matchPlanRoute>>, input: unknown, service: ReturnType<typeof createPlanService>) {
  if (route.action === 'generate') return service.start(route.projectId, input);
  if (route.action === 'cancel') return service.cancel(route.projectId);
  if (route.action === 'edit') return service.edit(route.projectId, input);
  if (route.action === 'approve') return service.approve(route.projectId, input);
  return service.status(route.projectId);
}
