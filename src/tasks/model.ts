export type TaskStatus = 'pending' | 'completed' | 'cancelled' | 'missed';
export type Frequency = 'daily' | 'weekly';
export interface RecurrenceRule {
  id: string;
  title: string;
  frequency: Frequency;
  startDate: string;
  nextDate: string | null;
  createdAt: string;
  stoppedAt: string | null;
}
export interface Task {
  id: string;
  title: string;
  plannedDate: string;
  status: TaskStatus;
  createdAt: string;
  resolvedAt: string | null;
  recurrenceId: string | null;
  frequency: Frequency | null;
}
export interface TaskView {
  today: string;
  due: Task[];
  upcoming: Task[];
  history: Task[];
  recurrences: RecurrenceRule[];
}
export class TaskInputError extends Error {}

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

export function recurrenceInput(input: unknown, today: string): { title: string; plannedDate: string; frequency: Frequency } {
  const task = taskInput(input);
  const frequency = (input as Record<string, unknown>).frequency;
  if (frequency !== 'daily' && frequency !== 'weekly') throw new TaskInputError('Choose daily or weekly repetition.');
  if (task.plannedDate < today) throw new TaskInputError('Choose today or a future first date for a repeating task.');
  return { ...task, frequency };
}

export function taskInput(input: unknown): { title: string; plannedDate: string } {
  const value = typeof input === 'object' && input !== null ? input as Record<string, unknown> : {};
  if (typeof value.title !== 'string' || !value.title.trim() || value.title.trim().length > 300) {
    throw new TaskInputError('Enter a task title with 1 to 300 characters.');
  }
  if (!validDate(value.plannedDate)) throw new TaskInputError('Choose a valid planned date.');
  return { title: value.title.trim(), plannedDate: value.plannedDate };
}
