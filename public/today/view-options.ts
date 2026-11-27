import type { Frequency, Task, TaskView } from '../../src/shared/tasks.ts';
import type { HabitPlan } from '../../src/shared/personal.ts';
import { occurrenceEnd } from '../../src/shared/weekdays.ts';
import { cueLine } from '../../src/shared/habits.ts';
import { t } from '../workspace/locale.ts';

// The cue in the chosen language. Chinese shows the moment as written, such as "after a shower".
export const afterCue = (cue: string) => t('After I {0}', cue);
export const cueText = (plan: Pick<HabitPlan, 'cue' | 'time' | 'place'> | undefined) => cueLine(plan, afterCue);
// "After I shower → read one page": the moment and the two-minute version, as a habit card shows them.
export const startText = (plan: Pick<HabitPlan, 'cue' | 'starter'> | undefined) =>
  plan ? [plan.cue && afterCue(plan.cue), plan.starter].filter(Boolean).join(' → ') : '';
// Time and place, without the cue.
export const whenText = (plan: Pick<HabitPlan, 'time' | 'place'> | undefined) => plan ? [plan.time, plan.place].filter(Boolean).join(' · ') : '';

export type Tab = 'due' | 'upcoming' | 'history';
// Mirrors the server rule: a repeating occurrence can be reopened only during its period.
export function canReopen(task: Task, view: TaskView): boolean {
  if (task.status !== 'completed' && task.status !== 'cancelled') return false;
  if (!task.recurrenceId) return true;
  const rule = view.recurrences.find(item => item.id === task.recurrenceId);
  if (!rule) return false;
  const end = occurrenceEnd(task, rule);
  return end === null || end > view.today;
}
export const frequencyLabels: Record<Frequency, string> = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', quarterly: 'Quarterly', yearly: 'Yearly' };
export const labels: Record<Tab, string> = { due: 'Today', upcoming: 'Upcoming', history: 'History' };
export const tabText: Record<Tab, { emptyTitle: string; emptyDescription: string }> = {
  due: {
    emptyTitle: "You're clear for today",
    emptyDescription: 'Choose New task or New habit to plan your day.',
  },
  upcoming: {
    emptyTitle: 'Nothing planned ahead',
    emptyDescription: 'Choose a future date when adding a task.',
  },
  history: {
    emptyTitle: 'Your history starts here',
    emptyDescription: 'Completed, cancelled and missed tasks will appear here.',
  },
};
export const dateText = (date: string) => new Intl.DateTimeFormat(document.documentElement.lang, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(date + 'T12:00:00'));
