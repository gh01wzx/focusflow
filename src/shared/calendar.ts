import type { Frequency } from './tasks.ts';

export function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return false;
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function localDay(date: Date): string {
  return `${date.getFullYear().toString().padStart(4, '0')}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
}

// Date-only arithmetic deliberately avoids local DST hours and UTC instant slicing.
export function nextOccurrence(date: string, frequency: Frequency): string | null {
  const result = new Date(date + 'T12:00:00Z');
  result.setUTCDate(result.getUTCDate() + (frequency === 'daily' ? 1 : 7));
  if (result.getUTCFullYear() > 9999) return null;
  return result.toISOString().slice(0, 10);
}

// Moves a date by whole days, for example the 14 days before today.
export function addDays(date: string, count: number): string {
  const result = new Date(date + 'T12:00:00Z');
  result.setUTCDate(result.getUTCDate() + count);
  return result.toISOString().slice(0, 10);
}

// Whole days from one date to a later one.
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to + 'T12:00:00Z') - Date.parse(from + 'T12:00:00Z')) / 86_400_000);
}
