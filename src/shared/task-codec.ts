import { validDate } from './calendar.ts';
import { validWeekdays } from './weekdays.ts';
import type { Frequency, RecurrenceRule, Task, TaskStatus, TaskView } from './tasks.ts';

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function frequency(value: unknown): value is Frequency {
  return value === 'daily' || value === 'weekly';
}

function status(value: unknown): value is TaskStatus {
  return value === 'pending' || value === 'completed' || value === 'cancelled' || value === 'missed';
}

function timestamp(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function task(value: unknown): value is Task {
  if (!record(value)) return false;
  const validRecurrence = value.recurrenceId === null
    ? value.frequency === null
    : typeof value.recurrenceId === 'string' && frequency(value.frequency);
  return typeof value.id === 'string' && typeof value.title === 'string'
    && validDate(value.plannedDate) && status(value.status) && timestamp(value.createdAt)
    && (value.status === 'pending' ? value.resolvedAt === null : timestamp(value.resolvedAt))
    && (value.status !== 'missed' || value.recurrenceId !== null) && validRecurrence;
}

function rule(value: unknown): value is RecurrenceRule {
  return record(value) && typeof value.id === 'string' && typeof value.title === 'string'
    && frequency(value.frequency) && validDate(value.startDate)
    && (value.weekdays === null || (value.frequency === 'weekly' && validWeekdays(value.weekdays)))
    && (value.nextDate === null || validDate(value.nextDate))
    && timestamp(value.createdAt) && (value.stoppedAt === null || timestamp(value.stoppedAt));
}

export function parseTask(value: unknown): Task {
  if (!task(value)) throw new Error('Invalid stored task.');
  return value;
}

export function parseRecurrenceRule(value: unknown): RecurrenceRule {
  if (!rule(value)) throw new Error('Invalid stored repeating task.');
  return value;
}

export function parseTaskView(value: unknown): TaskView {
  if (!record(value) || !validDate(value.today)
    || !Array.isArray(value.due) || !value.due.every(task)
    || !Array.isArray(value.upcoming) || !value.upcoming.every(task)
    || !Array.isArray(value.history) || !value.history.every(task)
    || !Array.isArray(value.recurrences) || !value.recurrences.every(rule)) {
    throw new Error('Could not read local tasks. Restart FocusFlow and try again.');
  }
  return { today: value.today, due: value.due, upcoming: value.upcoming,
    history: value.history, recurrences: value.recurrences };
}
