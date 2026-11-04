export type TaskStatus = 'pending' | 'completed' | 'cancelled';
export interface Task {
  id: string;
  title: string;
  plannedDate: string;
  status: TaskStatus;
  createdAt: string;
  resolvedAt: string | null;
}
export interface TaskView {
  today: string;
  due: Task[];
  upcoming: Task[];
  history: Task[];
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

export function taskInput(input: unknown): { title: string; plannedDate: string } {
  const value = typeof input === 'object' && input !== null ? input as Record<string, unknown> : {};
  if (typeof value.title !== 'string' || !value.title.trim() || value.title.trim().length > 300) {
    throw new TaskInputError('Enter a task title with 1 to 300 characters.');
  }
  if (!validDate(value.plannedDate)) throw new TaskInputError('Choose a valid planned date.');
  return { title: value.title.trim(), plannedDate: value.plannedDate };
}
