// A long view of each habit: one mark per day over about half a year.
export type DayMark = 'rest' | 'missed' | 'low' | 'check' | 'maintain' | 'goal';
export interface HabitHistory {
  id: string;
  title: string;
  // Stopped schedules include graduated habits; they can start again.
  stoppedAt: string | null;
  days: Record<string, DayMark>;
}
export interface HabitHistoryView { from: string; today: string; habits: HabitHistory[] }
export const HISTORY_WEEKS = 26;

export function parseHabitHistory(value: unknown): HabitHistoryView {
  const record = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  if (typeof record.from !== 'string' || typeof record.today !== 'string' || !Array.isArray(record.habits)) throw new Error('Could not read habit history.');
  return record as unknown as HabitHistoryView;
}
