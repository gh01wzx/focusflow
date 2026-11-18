import type { PlanDraft } from './personal.ts';

export type TaskStatus = 'pending' | 'completed' | 'cancelled' | 'missed';
export type Frequency = 'daily' | 'weekly';
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
export interface TaskDraft {
  category?: ActivityCategory;
  title: string;
  plannedDate: string;
  frequency: 'none' | Frequency;
  weekdays?: Weekday[];
  /** Legacy clients use this flag for minute tracking. */
  habit?: boolean;
  mode?: 'minutes' | 'complete';
  plan?: PlanDraft;
}
