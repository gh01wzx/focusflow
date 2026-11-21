// A few goals per quarter give the daily tasks and habits a direction. At the start of each quarter
// the review marks the last quarter's goals done, carries them on, or lets them go.
export type GoalStatus = 'active' | 'done' | 'dropped';
export interface GoalLink { subject: string; title: string; habit: boolean }
export interface Goal {
  id: string;
  title: string;
  // The calendar quarter, such as 2026-Q4.
  quarter: string;
  status: GoalStatus;
  createdAt: string;
  // Linked tasks and habits, and how often they were completed or checked in during the quarter.
  links: GoalLink[];
  done: number;
}
export interface GoalsView { quarter: string; goals: Goal[] }
// More than a few goals at once spreads attention thin, so a gentle note appears after three.
export const GOAL_LIMIT = 3;
export const GOAL_ACTIONS = ['done', 'drop', 'carry'] as const;
export type GoalAction = typeof GOAL_ACTIONS[number];

export function quarterOf(day: string): string {
  const [year, month] = day.split('-').map(Number) as [number, number];
  return `${year}-Q${Math.floor((month - 1) / 3) + 1}`;
}

// First and last day of a quarter, inclusive.
export function quarterRange(quarter: string): { start: string; end: string } {
  const [year, number] = [Number(quarter.slice(0, 4)), Number(quarter.slice(6))];
  const first = (number - 1) * 3 + 1, last = first + 2;
  const days = new Date(Date.UTC(year, last, 0)).getUTCDate();
  const pad = (value: number) => String(value).padStart(2, '0');
  return { start: `${year}-${pad(first)}-01`, end: `${year}-${pad(last)}-${pad(days)}` };
}

export function parseGoalsView(value: unknown): GoalsView {
  const record = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  if (typeof record.quarter !== 'string' || !Array.isArray(record.goals)) throw new Error('Could not read goals.');
  return record as unknown as GoalsView;
}
