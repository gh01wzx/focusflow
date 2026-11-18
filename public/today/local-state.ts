// Small conveniences kept in this browser only: the running timer, whether today was closed,
// whether this week was reviewed and which cards are folded. Saved tasks, logged minutes and
// focus are the record.
const TIMER_KEY = 'focusflow.timer';
const CLOSED_KEY = 'focusflow.closed';
const REVIEWED_KEY = 'focusflow.reviewed';

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

// The last local day closed with Close the day, so the evening prompt shows once per day.
export function readClosed(): string {
  const value = read(CLOSED_KEY);
  return typeof value === 'string' ? value : '';
}
export const writeClosed = (day: string) => write(CLOSED_KEY, day);

// The Monday of the last week reviewed, so the weekly prompt shows once per week.
export function readReviewed(): string {
  const value = read(REVIEWED_KEY);
  return typeof value === 'string' ? value : '';
}
export const writeReviewed = (week: string) => write(REVIEWED_KEY, week);

// Cards folded or opened with a click, by view and card, so they stay that way after a restart.
const FOLDED_KEY = 'focusflow.folded';
export function readFolded(): Record<string, boolean> {
  const value = read(FOLDED_KEY);
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, boolean] => typeof entry[1] === 'boolean'));
}
export const writeFolded = (folded: Record<string, boolean>) => write(FOLDED_KEY, folded);

// Suggestions taken in this week's review, so reopening it does not suggest the same step again.
const CHANGES_KEY = 'focusflow.reviewChanges';
export function readReviewChanges(week: string): Record<string, string> {
  const value = read(CHANGES_KEY) as { week?: unknown; changes?: unknown } | null;
  if (value?.week !== week || !value.changes || typeof value.changes !== 'object') return {};
  return Object.fromEntries(Object.entries(value.changes).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
}
export const writeReviewChanges = (week: string, changes: Record<string, string>) => write(CHANGES_KEY, { week, changes });
