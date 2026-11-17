import type { HabitPlan, ScoringRule } from './personal.ts';
import type { Task, TaskView } from './tasks.ts';

// Habit-tracking views derived from saved tasks. These rules never change data.
export type Mark = 'done' | 'started' | 'missed' | 'rest' | 'open';
export interface HabitInsight {
  // Recent occurrences, oldest first, ending with today's state.
  marks: Mark[];
  // Occurrences shown up for in a row. One miss is forgiven; two misses in a row end the chain.
  chain: number;
  // Shown-up occurrences among the latest seven that were not rest days.
  consistency: { shown: number; total: number };
  // The previous scheduled occurrence was missed and today's is not started yet.
  missedLast: boolean;
}
export interface Progress { done: number; total: number }

// "After I pour coffee · 07:30 · Kitchen": the cue, time and place that make a habit obvious.
export function cueLine(plan: Pick<HabitPlan, 'cue' | 'time' | 'place'> | undefined): string {
  if (!plan) return '';
  return [plan.cue && 'After I ' + plan.cue, plan.time, plan.place].filter(Boolean).join(' · ');
}

// A cancelled occurrence is a rest day. Minutes logged on a missed timed habit still count as showing up.
export function habitInsight(task: Task, history: Task[], today: { done: boolean; started: boolean },
  startedOn: (day: string) => boolean = () => false): HabitInsight {
  const past: Mark[] = history.filter(item => item.recurrenceId === task.recurrenceId && item.plannedDate < task.plannedDate)
    .sort((a, b) => a.plannedDate.localeCompare(b.plannedDate))
    .map(item => item.status === 'completed' ? 'done' : item.status === 'cancelled' ? 'rest'
      : startedOn(item.plannedDate) ? 'started' : 'missed');
  const current: Mark = today.done ? 'done' : today.started ? 'started' : 'open';
  const shown = (mark: Mark) => mark === 'done' || mark === 'started';
  let chain = shown(current) ? 1 : 0;
  let misses = 0;
  for (let index = past.length - 1; index >= 0; index--) {
    const mark = past[index]!;
    if (mark === 'rest') continue;
    if (mark === 'missed') {
      if (++misses >= 2) break;
      continue;
    }
    misses = 0;
    chain++;
  }
  const counted = [...past, ...(shown(current) ? [current] : [])].filter(mark => mark !== 'rest').slice(-7);
  const last = [...past].reverse().find(mark => mark !== 'rest');
  return {
    marks: [...past.slice(-6), current],
    chain,
    consistency: { shown: counted.filter(shown).length, total: counted.length },
    missedLast: last === 'missed' && !shown(current),
  };
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

// The order for "Next": planned times that have arrived first, then untimed habits and tasks,
// then later planned times. A timed habit already started today moves to the back, because
// showing up is what counts; one that met its target is finished for the day.
export function nextUp(due: Task[], rules: Map<string, ScoringRule>, minutes: Record<string, number>, now: string): Task[] {
  const rank = (task: Task) => {
    if ((minutes[task.id] ?? 0) > 0) return 4;
    const time = rules.get(task.recurrenceId ?? task.id)?.time ?? '';
    return time && time <= now ? 0 : !time ? (task.recurrenceId ? 1 : 2) : 3;
  };
  const time = (task: Task) => rules.get(task.recurrenceId ?? task.id)?.time ?? '';
  return due.map((task, index) => ({ task, index })).filter(({ task }) => {
    const rule = rules.get(task.recurrenceId ?? task.id);
    return !(rule?.mode === 'minutes' && (minutes[task.id] ?? 0) >= rule.target);
  }).sort((a, b) => rank(a.task) - rank(b.task) || time(a.task).localeCompare(time(b.task)) || a.index - b.index)
    .map(({ task }) => task);
}
