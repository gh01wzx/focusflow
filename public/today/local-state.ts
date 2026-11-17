// Small conveniences kept in this browser only: the running timer, tasks set aside with
// "Later" and whether today was closed. Saved tasks, logged minutes and focus are the record.
const TIMER_KEY = 'focusflow.timer';
const SKIPPED_KEY = 'focusflow.skipped';
const CLOSED_KEY = 'focusflow.closed';

function read(key: string): unknown {
  try { return JSON.parse(localStorage.getItem(key) ?? 'null') as unknown; } catch { return null; }
}
function write(key: string, value: unknown): void {
  try {
    if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, JSON.stringify(value));
  } catch { /* The value still works for this page. */ }
}

// The timer is a task ID and a start time, so it survives tab changes, reloads and a hidden window.
export interface Timer { taskId: string; startedAt: number }
export function readTimer(): Timer | null {
  const value = read(TIMER_KEY) as Partial<Timer> | null;
  return value && typeof value.taskId === 'string' && Number.isFinite(value.startedAt) ? value as Timer : null;
}
export const writeTimer = (timer: Timer | null) => write(TIMER_KEY, timer);

// "Later" lasts for one local day.
export function readSkipped(day: string): string[] {
  const value = read(SKIPPED_KEY) as { day?: unknown; ids?: unknown } | null;
  return value?.day === day && Array.isArray(value.ids) ? value.ids.filter((id): id is string => typeof id === 'string') : [];
}
export const writeSkipped = (day: string, ids: string[]) => write(SKIPPED_KEY, { day, ids });

// The last local day closed with Close the day, so the evening prompt shows once per day.
export function readClosed(): string {
  const value = read(CLOSED_KEY);
  return typeof value === 'string' ? value : '';
}
export const writeClosed = (day: string) => write(CLOSED_KEY, day);
