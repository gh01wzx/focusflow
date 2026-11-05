import type { createTaskService } from './service.ts';
import type { Snapshot } from '../database/backup.ts';

type TaskApi = ReturnType<typeof createTaskService> & { snapshot(): Promise<Snapshot> };

type TaskRoute =
  | { kind: 'view' | 'add' | 'addRecurrence' | 'backup' }
  | { kind: 'resolve' | 'stop'; id: string };

export function matchTaskRoute(method: string | undefined, path: string): TaskRoute | undefined {
  if (method === 'GET' && path === '/api/tasks') return { kind: 'view' };
  if (method !== 'POST') return undefined;
  if (path === '/api/tasks') return { kind: 'add' };
  if (path === '/api/recurrences') return { kind: 'addRecurrence' };
  if (path === '/api/tasks/backup') return { kind: 'backup' };
  const resolve = /^\/api\/tasks\/([a-f0-9-]{36})\/resolve$/.exec(path);
  if (resolve?.[1]) return { kind: 'resolve', id: resolve[1] };
  const stop = /^\/api\/recurrences\/([a-f0-9-]{36})\/stop$/.exec(path);
  if (stop?.[1]) return { kind: 'stop', id: stop[1] };
  return undefined;
}

export async function dispatchTaskRoute(
  route: TaskRoute, input: unknown, store: TaskApi,
): Promise<{ status: number; body: unknown }> {
  switch (route.kind) {
    case 'view': return { status: 200, body: store.view() };
    case 'add': return { status: 201, body: { task: store.add(input), view: store.view() } };
    case 'addRecurrence': return { status: 201, body: { rule: store.addRecurrence(input), view: store.view() } };
    case 'backup': return { status: 201, body: { name: (await store.snapshot()).name } };
    case 'stop': {
      const rule = store.stopRecurrence(route.id);
      return rule ? { status: 200, body: { rule, view: store.view() } }
        : { status: 404, body: { error: 'Repeating task not found' } };
    }
    case 'resolve': {
      const status = typeof input === 'object' && input !== null && 'status' in input ? input.status : undefined;
      const task = store.resolve(route.id, status);
      return task ? { status: 200, body: { task, view: store.view() } }
        : { status: 404, body: { error: 'Task not found' } };
    }
  }
}
