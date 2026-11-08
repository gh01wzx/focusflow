import { executionRecord } from '../shared/execution.ts';
import type { createWorkspaceService } from './workspaces.ts';
import type { RepositoryInspection } from '../shared/execution.ts';

export function matchCodingRoute(method: string | undefined, path: string) {
  const match = /^\/api\/project-tickets\/([a-f0-9-]{36})\/coding(?:\/(inspect|prepare))?$/.exec(path);
  if (!match || (match[2] ? method !== 'POST' : method !== 'GET')) return undefined;
  return { ticketId: match[1]!, action: match[2] ?? 'read' };
}
export async function dispatchWorkspaceRoute(route: NonNullable<ReturnType<typeof matchCodingRoute>>, input: unknown,
  workspaces: ReturnType<typeof createWorkspaceService>) {
  let inspection: RepositoryInspection | null = null;
  if (route.action === 'inspect') inspection = await workspaces.inspect(route.ticketId, input);
  if (route.action === 'prepare') await workspaces.prepare(route.ticketId, executionRecord(input));
  return { ticketId: route.ticketId, workspace: workspaces.read(route.ticketId), inspection };
}
