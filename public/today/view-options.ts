import type { Task, TaskView } from '../../src/shared/tasks.ts';
import { periodEnd } from '../../src/shared/weekdays.ts';

export type Tab = 'due' | 'upcoming' | 'history';
// Mirrors the server rule: a repeating occurrence can be reopened only during its period.
export function canReopen(task: Task, view: TaskView): boolean {
  if (task.status !== 'completed' && task.status !== 'cancelled') return false;
  if (!task.recurrenceId) return true;
  const rule = view.recurrences.find(item => item.id === task.recurrenceId);
  if (!rule) return false;
  const end = periodEnd(task.plannedDate, rule.frequency, rule.weekdays);
  return end === null || end > view.today;
}
export const labels: Record<Tab, string> = { due: 'Today', upcoming: 'Upcoming', history: 'History' };
export const tabText: Record<Tab, { subtitle: string; emptyTitle: string; emptyDescription: string }> = {
  due: {
    subtitle: 'A clear view of what needs doing.',
    emptyTitle: "You're clear for today",
    emptyDescription: 'Choose New task to plan a one-off task, a repeating task or a timed habit.',
  },
  upcoming: {
    subtitle: 'Your plans for the days ahead.',
    emptyTitle: 'Nothing planned ahead',
    emptyDescription: 'Choose a future date when adding a task.',
  },
  history: {
    subtitle: 'Completed, cancelled and missed tasks.',
    emptyTitle: 'Your history starts here',
    emptyDescription: 'Completed, cancelled and missed tasks will appear here.',
  },
};
export const dateText = (date: string) => new Intl.DateTimeFormat(document.documentElement.lang, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(date + 'T12:00:00'));
