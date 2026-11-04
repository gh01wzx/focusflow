import { validDate } from '../shared/calendar.ts';
import type { Frequency } from '../shared/tasks.ts';

export class TaskInputError extends Error {}

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
