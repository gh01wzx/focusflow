import type { RecurrenceRule, Task, TaskView } from '../shared/tasks.ts';

export function buildTaskView(today: string, tasks: Task[], recurrences: RecurrenceRule[]): TaskView {
  return {
    today,
    due: tasks.filter(task => task.status === 'pending' && task.plannedDate <= today),
    upcoming: tasks.filter(task => task.status === 'pending' && task.plannedDate > today),
    history: tasks.filter(task => task.status !== 'pending').sort((a, b) =>
      (b.resolvedAt ?? '').localeCompare(a.resolvedAt ?? '')
      || b.plannedDate.localeCompare(a.plannedDate) || b.id.localeCompare(a.id)),
    recurrences,
  };
}
