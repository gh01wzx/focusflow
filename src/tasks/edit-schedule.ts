import { randomUUID } from 'node:crypto';
import { localDay, validDate } from '../shared/calendar.ts';
import type { RecurrenceRule } from '../shared/tasks.ts';
import { firstSelectedDate, nextScheduledDate, occurrenceEnd, validWeekdays, WEEKDAYS } from '../shared/weekdays.ts';
import type { TaskRepository } from './repository.ts';
import { TaskInputError } from './validation.ts';

// The caller saves this change and the rest of the plan in one database transaction.
export function editSchedule(tasks: TaskRepository, rule: RecurrenceRule, input: unknown, now: Date) {
  if (rule.stoppedAt || !input || typeof input !== 'object') throw new TaskInputError('Open an active plan to change its schedule.');
  const { frequency, weekdays, date, previous } = input as Record<string, unknown>;
  const today = localDay(now);
  if (!validDate(date) || date < today) throw new TaskInputError('Choose today or a future effective date.');
  if (frequency !== 'daily' && frequency !== 'weekly') throw new TaskInputError('Choose daily or weekly repetition.');
  const legacy = frequency === 'weekly' && weekdays === null && rule.frequency === 'weekly' && rule.weekdays === null;
  if (frequency === 'weekly' && !legacy && !validWeekdays(weekdays)) throw new TaskInputError('Choose one or more different weekdays.');
  if (previous !== JSON.stringify([rule.frequency, rule.weekdays, rule.nextDate])) throw new TaskInputError('The schedule changed. Reopen the plan and try again.');
  const days = frequency === 'weekly' && validWeekdays(weekdays) ? WEEKDAYS.filter(day => weekdays.includes(day.value)).map(day => day.value) : null;
  tasks.prepareScheduleEdit(rule);
  const latest = tasks.occurrenceAt(rule.id, today);
  const end = latest && occurrenceEnd(latest, rule);
  const start = end && end > date ? end : date;
  let first = latest && end === null ? null : days ? firstSelectedDate(start, days) : start;
  // A removed occurrence keeps its place in the calendar. Never recreate it on a retry.
  while (first && tasks.hasOccurrence(rule.id, first)) first = nextScheduledDate(first, frequency, days);
  if (!first) throw new TaskInputError('No scheduled date remains in the supported range.');
  tasks.updateSchedule({ ...rule, frequency, weekdays: days, nextDate: nextScheduledDate(first, frequency, days) });
  tasks.insertTask({ id: randomUUID(), title: rule.title, plannedDate: first, status: 'pending', createdAt: now.toISOString(),
    resolvedAt: null, recurrenceId: rule.id, frequency });
}
