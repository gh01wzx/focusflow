import type { PlanDraft } from './personal.ts';

export type TaskStatus = 'pending' | 'completed' | 'cancelled' | 'missed';
export type Frequency = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';
export const FREQUENCIES: readonly Frequency[] = ['daily', 'weekly', 'monthly', 'quarterly', 'yearly'];
// Habits build consistency day by day, so only repeating tasks use month-based schedules.
export const HABIT_FREQUENCIES: readonly Frequency[] = ['daily', 'weekly'];
// Whole months between occurrences, or null for day-based schedules.
export function monthsBetween(frequency: Frequency): number | null {
  return frequency === 'monthly' ? 1 : frequency === 'quarterly' ? 3 : frequency === 'yearly' ? 12 : null;
}
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export type ActivityCategory = 'task' | 'habit';
export interface RecurrenceRule {
  category?: ActivityCategory;
  id: string;
  title: string;
  frequency: Frequency;
  weekdays: Weekday[] | null;
  startDate: string;
  nextDate: string | null;
  createdAt: string;
  stoppedAt: string | null;
}
export interface Task {
  periodFrequency?: Frequency | null;
  category?: ActivityCategory;
  id: string;
  title: string;
  plannedDate: string;
  status: TaskStatus;
  createdAt: string;
  resolvedAt: string | null;
  recurrenceId: string | null;
  frequency: Frequency | null;
}
export function isHabit(item: Task | RecurrenceRule): boolean {
  if (item.category) return item.category === 'habit';
  return !('recurrenceId' in item) || item.recurrenceId !== null;
}
export interface TaskView {
  today: string;
  due: Task[];
  upcoming: Task[];
  history: Task[];
  recurrences: RecurrenceRule[];
  // One-off task IDs chosen as the focus, in order, for today and tomorrow.
  focus: { today: string[]; tomorrow: string[] };
}

export type TaskResolution = 'completed' | 'cancelled';
// History returns the most recent resolved tasks. Older records stay in the database.
export const HISTORY_LIMIT = 200;
// A day's focus is a short list on purpose: picking at most three keeps the choice easy.
export const FOCUS_LIMIT = 3;
// A changed schedule can start at most this many days ahead. Until then the old schedule keeps
// running, so its remaining occurrences are created at once and appear in Upcoming.
export const SCHEDULE_LEAD_DAYS = 28;
export interface TaskDraft {
  category?: ActivityCategory;
  title: string;
  plannedDate: string;
  frequency: 'none' | Frequency;
  weekdays?: Weekday[];
  // A flexible weekly habit: seven-day periods on any days, with plan.timesPerWeek.
  flexible?: boolean;
  /** Legacy clients use this flag for minute tracking. */
  habit?: boolean;
  mode?: 'minutes' | 'complete';
  unit?: 'minutes' | 'count';
  plan?: PlanDraft;
}
