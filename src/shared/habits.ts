import { isHabit } from './tasks.ts';
import { addDays, daysBetween, localDay, nextOccurrence } from './calendar.ts';
import { occurrenceEnd } from './weekdays.ts';
import type { HabitPlan, Outcome, ScoringRule } from './personal.ts';
import type { RecurrenceRule, Task, TaskStatus, TaskView } from './tasks.ts';

// Habit-tracking views derived from saved tasks. These rules never change data.
export type Mark = Outcome | 'open';
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

// Whether a completed item belongs to today's progress. A repeating occurrence counts only while
// its period is current: one whose goal was met yesterday is settled at the first refresh after
// midnight, so it is resolved today but belongs to yesterday.
export function doneToday(task: Task, today: string, schedules: RecurrenceRule[]): boolean {
  if (task.status !== 'completed' || !task.resolvedAt || localDay(new Date(task.resolvedAt)) !== today) return false;
  if (!task.recurrenceId) return true;
  const rule = schedules.find(item => item.id === task.recurrenceId);
  const end = rule ? occurrenceEnd(task, rule) : nextOccurrence(task.plannedDate, 'daily');
  return task.plannedDate <= today && (end === null || end > today);
}

// Count each occurrence in its own category. Timed habits can reach their target while open.
export function todayProgress(view: TaskView, rules: Map<string, ScoringRule>, minutes: Record<string, number>,
  completedToday: Task[]): { habits: Progress; tasks: Progress } {
  const habitsDue = view.due.filter(isHabit);
  // A timed habit counts once it is checked in; see tiersOf.
  const timedDone = habitsDue.filter(task => {
    const rule = rules.get(task.recurrenceId!);
    return rule?.mode === 'minutes' && (minutes[task.id] ?? 0) >= tiersOf(rule).start;
  }).length;
  const routinesDone = completedToday.filter(isHabit).length;
  const tasksDone = completedToday.filter(task => !isHabit(task)).length;
  const countedTasksDone = view.due.filter(task => !isHabit(task) && rules.get(task.recurrenceId ?? task.id)?.mode === 'minutes'
    && (minutes[task.id] ?? 0) >= rules.get(task.recurrenceId ?? task.id)!.target).length;
  return {
    habits: { done: timedDone + routinesDone, total: habitsDue.length + routinesDone },
    tasks: { done: tasksDone + countedTasksDone, total: view.due.filter(task => !isHabit(task)).length + tasksDone },
  };
}

// The order for the timer cards: planned times that have arrived first, then untimed habits and
// tasks, then later planned times. A timed habit already started today moves to the back, because
// showing up is what counts; one that met its target is finished for the day.
export function nextUp(due: Task[], rules: Map<string, ScoringRule>, minutes: Record<string, number>, now: string): Task[] {
  const rank = (task: Task) => {
    if ((minutes[task.id] ?? 0) > 0) return 4;
    const time = rules.get(task.recurrenceId ?? task.id)?.time ?? '';
    if (time && time <= now) return 0;
    return !time ? (isHabit(task) ? 1 : 2) : 3;
  };
  const time = (task: Task) => rules.get(task.recurrenceId ?? task.id)?.time ?? '';
  return due.map((task, index) => ({ task, index })).filter(({ task }) => {
    const rule = rules.get(task.recurrenceId ?? task.id);
    return !(rule?.mode === 'minutes' && (minutes[task.id] ?? 0) >= rule.target);
  }).sort((a, b) => rank(a.task) - rank(b.task) || time(a.task).localeCompare(time(b.task)) || a.index - b.index)
    .map(({ task }) => task);
}

// Votes add up per identity, ignoring letter case, so "A reader" and "a reader" count together.
export const identityKey = (identity: string) => identity.trim().toLowerCase();

// How a resolved occurrence ended. An open occurrence has no outcome yet.
export function outcomeOf(status: TaskStatus, minutes: number): Outcome | null {
  if (status === 'completed') return 'done';
  if (status === 'cancelled') return 'rest';
  if (status === 'missed') return minutes > 0 ? 'started' : 'missed';
  return null;
}

// Weekly review. Two steady weeks (85% or more) suggest a next step, a week under half suggests
// making the habit easier, and about 66 days (the median in Lally et al. 2010) suggests it may be
// automatic enough to graduate. More than three habits at once gets a gentle note.
export const HABIT_LIMIT = 3;
export const GRADUATE_DAYS = 66;
export const TARGET_STEPS = [2, 5, 10, 15, 20, 30, 45, 60, 90, 120];

// A timed or counted habit climbs three tiers each day: check in (the two-minute version, easy
// even on a busy day), maintain (enough to keep the habit alive) and goal. Showing up is the
// check-in, so the day's habit ring closes there and the goal earns a small bonus.
export interface Tiers { start: number; maintain: number; goal: number }
export type TierLevel = 0 | 1 | 2 | 3;
export const GOAL_BONUS = 0.2;
export function tiersOf(rule: Pick<ScoringRule, 'target' | 'unit' | 'start' | 'maintain'>): Tiers {
  const goal = Math.max(1, rule.target);
  const start = Math.min(goal, Math.max(1, rule.start ?? (rule.unit === 'count' ? 1 : 2)));
  const maintain = Math.min(goal, Math.max(start, rule.maintain ?? Math.round((start + goal) / 2)));
  return { start, maintain, goal };
}
// 0 not yet, 1 checked in, 2 maintained, 3 goal met.
export function tierLevel(amount: number, tiers: Tiers): TierLevel {
  return amount >= tiers.goal ? 3 : amount >= tiers.maintain ? 2 : amount >= tiers.start ? 1 : 0;
}
// The next tier to reach and how much more it needs, or null once the goal is met.
export function nextTier(amount: number, tiers: Tiers): { level: 1 | 2 | 3; amount: number; remaining: number } | null {
  for (const [level, value] of [[1, tiers.start], [2, tiers.maintain], [3, tiers.goal]] as const) {
    if (amount < value) return { level, amount: value, remaining: value - amount };
  }
  return null;
}
// The points bonus for reaching the goal: a fifth of the goal's points, in whole points.
export function goalBonus(rule: Pick<ScoringRule, 'target' | 'rate'>): number {
  return Math.round(rule.target * rule.rate * GOAL_BONUS / 100) * 100;
}
const STEADY = 0.85, HARD = 0.5;

export type Suggestion = { kind: 'new' } | { kind: 'keep' } | { kind: 'steady' } | { kind: 'stack' }
  | { kind: 'grow'; target: number } | { kind: 'ease'; target: number | null } | { kind: 'graduate'; days: number };
export interface HabitReview {
  id: string;
  title: string;
  identity: string;
  // Outcomes in the last seven days, oldest first. Days without an occurrence are left out.
  marks: Outcome[];
  // Shown up out of scheduled occurrences, rest days aside: the last seven days and the seven before.
  week: Progress;
  before: Progress;
  suggestion: Suggestion;
}

export function reviewHabits(today: string, schedules: RecurrenceRule[], rules: Map<string, ScoringRule>,
  recent: Record<string, Record<string, Outcome>>): HabitReview[] {
  const lastWeek = Array.from({ length: 7 }, (_, index) => addDays(today, index - 7));
  const weekBefore = lastWeek.map(day => addDays(day, -7));
  const shown = (outcome: Outcome) => outcome === 'done' || outcome === 'started';
  const met = (outcome: Outcome) => outcome === 'done';
  const steady = (progress: Progress) => progress.total > 0 && progress.done / progress.total >= STEADY;
  const started = schedules.filter(schedule => isHabit(schedule) && schedule.startDate <= today);
  return started.map(schedule => {
    const rule = rules.get(schedule.id);
    const outcomes = recent[schedule.id] ?? {};
    const held = (days: string[]) => days.map(day => outcomes[day]).filter((outcome): outcome is Outcome => !!outcome);
    const tally = (days: string[], counts: (outcome: Outcome) => boolean): Progress => {
      const scheduled = held(days).filter(outcome => outcome !== 'rest');
      return { done: scheduled.filter(counts).length, total: scheduled.length };
    };
    const week = tally(lastWeek, shown), before = tally(weekBefore, shown);
    const age = daysBetween(schedule.startDate, today);
    const enough = week.total > 0 && before.total > 0 && week.total + before.total >= 4;
    const twoSteadyWeeks = enough && steady(week) && steady(before);
    let suggestion: Suggestion;
    if (age < 7 || (!enough && age < 14)) suggestion = { kind: 'new' };
    else if (twoSteadyWeeks && age >= GRADUATE_DAYS) suggestion = { kind: 'graduate', days: age };
    else if (twoSteadyWeeks && rule?.mode === 'minutes' && rule.unit !== 'count') {
      // Growing needs the target met, not only showing up.
      const next = TARGET_STEPS.find(step => step > rule.target);
      suggestion = next && steady(tally(lastWeek, met)) && steady(tally(weekBefore, met)) ? { kind: 'grow', target: next } : { kind: 'steady' };
    } else if (twoSteadyWeeks) suggestion = started.length < HABIT_LIMIT ? { kind: 'stack' } : { kind: 'steady' };
    else if (week.total >= 3 && week.done / week.total < HARD) {
      suggestion = { kind: 'ease', target: rule?.mode === 'minutes' && rule.unit !== 'count' ? TARGET_STEPS.findLast(step => step < rule.target) ?? null : null };
    } else suggestion = { kind: 'keep' };
    return { id: schedule.id, title: schedule.title, identity: rule?.identity ?? '', marks: held(lastWeek), week, before, suggestion };
  });
}

// Days in a row, before today, on which every scheduled habit reached done. Rest days and days
// with nothing scheduled neither count nor break the run. The window is the recent outcomes kept.
export function fullDaysBefore(today: string, habitIds: string[], recent: Record<string, Record<string, Outcome>>): number {
  let run = 0;
  for (let back = 1; back <= 14; back++) {
    const day = addDays(today, -back);
    const outcomes = habitIds.map(id => recent[id]?.[day]).filter((outcome): outcome is Outcome => !!outcome && outcome !== 'rest');
    if (!outcomes.length) continue;
    if (outcomes.some(outcome => outcome !== 'done')) break;
    run++;
  }
  return run;
}
