import { nextOccurrence } from './calendar.ts';
import type { Frequency, Weekday } from './tasks.ts';

export const WEEKDAYS = [
  { value: 1, label: 'Mon', name: 'Monday' },
  { value: 2, label: 'Tue', name: 'Tuesday' },
  { value: 3, label: 'Wed', name: 'Wednesday' },
  { value: 4, label: 'Thu', name: 'Thursday' },
  { value: 5, label: 'Fri', name: 'Friday' },
  { value: 6, label: 'Sat', name: 'Saturday' },
  { value: 0, label: 'Sun', name: 'Sunday' },
] as const;

export function validWeekdays(value: unknown): value is Weekday[] {
  return Array.isArray(value) && value.length > 0 && value.length <= 7
    && value.every(day => Number.isInteger(day) && day >= 0 && day <= 6)
    && new Set(value).size === value.length;
}

export function firstSelectedDate(date: string, weekdays: Weekday[]): string | null {
  let candidate: string | null = date;
  for (let offset = 0; offset < 7 && candidate !== null; offset++) {
    if (weekdays.includes(new Date(candidate + 'T12:00:00Z').getUTCDay() as Weekday)) return candidate;
    candidate = nextOccurrence(candidate, 'daily');
  }
  return null;
}

export function nextScheduledDate(date: string, frequency: Frequency, weekdays: Weekday[] | null): string | null {
  if (weekdays === null) return nextOccurrence(date, frequency);
  const tomorrow = nextOccurrence(date, 'daily');
  return tomorrow === null ? null : firstSelectedDate(tomorrow, weekdays);
}
