import type { RecurrenceRule, Task, TaskView } from '../shared/tasks.ts';

export function buildTaskView(today: string, pending: Task[], history: Task[], recurrences: RecurrenceRule[],
  focus: TaskView['focus']): TaskView {
  return {
    today,
    due: pending.filter(task => task.plannedDate <= today),
    upcoming: pending.filter(task => task.plannedDate > today),
    history: [...history].sort((a, b) =>
      (b.resolvedAt ?? '').localeCompare(a.resolvedAt ?? '')
      || b.plannedDate.localeCompare(a.plannedDate) || b.id.localeCompare(a.id)),
    recurrences,
    focus,
  };
}
