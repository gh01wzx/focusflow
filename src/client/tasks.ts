import { parseTaskView } from '../shared/task-codec.ts';
import type { TaskDraft, TaskResolution, TaskView } from '../shared/tasks.ts';

export function createTaskClient(transport: typeof fetch = fetch) {
  async function request(path: string, value?: unknown): Promise<TaskView> {
    const response = await transport(path, value === undefined ? {} : {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value),
    });
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new Error('Could not read local tasks. Restart FocusFlow and try again.');
    }
    if (!response.ok) {
      const error = typeof payload === 'object' && payload !== null && 'error' in payload ? payload.error : undefined;
      throw new Error(typeof error === 'string' ? error : 'Could not save. Please try again.');
    }
    const view = typeof payload === 'object' && payload !== null && 'view' in payload ? payload.view : payload;
    return parseTaskView(view);
  }

  return {
    read: () => request('/api/tasks'),
    add: (draft: TaskDraft) => request(draft.frequency === 'none' ? '/api/tasks' : '/api/recurrences', draft),
    resolve: (id: string, status: TaskResolution) => request(`/api/tasks/${id}/resolve`, { status }),
    stopRecurrence: (id: string) => request(`/api/recurrences/${id}/stop`, {}),
  };
}
