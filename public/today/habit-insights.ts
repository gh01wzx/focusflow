import type { HabitPlan, ScoringRule } from '../../src/shared/personal.ts';
import type { Task, TaskView } from '../../src/shared/tasks.ts';

// Habit-tracking views derived from saved tasks. Nothing here changes data.
export type Mark = 'done' | 'started' | 'missed' | 'skipped' | 'open';
export interface HabitInsight { marks: Mark[]; streak: number; missedLast: boolean }
export interface Progress { done: number; total: number }

// "After I pour coffee · 07:30 · Kitchen": the cue, time and place that make a habit obvious.
export function cueLine(plan: Pick<HabitPlan, 'cue' | 'time' | 'place'> | undefined): string {
  if (!plan) return '';
  return [plan.cue && 'After I ' + plan.cue, plan.time, plan.place].filter(Boolean).join(' · ');
}

// Recent occurrences of one repeating task, oldest first, ending with today's state.
// A streak counts completed occurrences in a row; a skipped (cancelled) one does not break it.
// A missed timed habit with some minutes logged on its day shows as started.
export function habitInsight(task: Task, view: TaskView, today: { done: boolean; started: boolean },
  startedOn: (day: string) => boolean = () => false): HabitInsight {
  const past = view.history.filter(item => item.recurrenceId === task.recurrenceId && item.plannedDate < task.plannedDate)
    .sort((a, b) => a.plannedDate.localeCompare(b.plannedDate));
  const marks: Mark[] = past.slice(-6).map(item => item.status === 'completed' ? 'done'
    : item.status === 'missed' ? (startedOn(item.plannedDate) ? 'started' : 'missed') : 'skipped');
  marks.push(today.done ? 'done' : today.started ? 'started' : 'open');
  let streak = today.done ? 1 : 0;
  for (let index = past.length - 1; index >= 0; index--) {
    const status = past[index]!.status;
    if (status === 'cancelled') continue;
    if (status !== 'completed') break;
    streak++;
  }
  const last = [...past].reverse().find(item => item.status !== 'cancelled');
  return { marks, streak, missedLast: last?.status === 'missed' && !today.done };
}

// Today's rings: repeating habits and one-off tasks that are done out of those due today.
export function todayProgress(view: TaskView, rules: Map<string, ScoringRule>, minutes: Record<string, number>,
  completedToday: Task[]): { habits: Progress; tasks: Progress } {
  const habitsDue = view.due.filter(task => task.recurrenceId);
  const timedDone = habitsDue.filter(task => {
    const rule = rules.get(task.recurrenceId!);
    return rule?.mode === 'minutes' && (minutes[task.id] ?? 0) >= rule.target;
  }).length;
  const routinesDone = completedToday.filter(task => task.recurrenceId).length;
  const tasksDone = completedToday.filter(task => !task.recurrenceId).length;
  return {
    habits: { done: timedDone + routinesDone, total: habitsDue.length + routinesDone },
    tasks: { done: tasksDone, total: view.due.filter(task => !task.recurrenceId).length + tasksDone },
  };
}
