import { localDay, nextOccurrence, validDate } from '../shared/calendar.ts';
import { firstSelectedDate, nextScheduledDate, occurrenceEnd, scheduleDay } from '../shared/weekdays.ts';
import { FOCUS_LIMIT, HABIT_FREQUENCIES, HISTORY_LIMIT } from '../shared/tasks.ts';
import type { RecurrenceRule, Task } from '../shared/tasks.ts';
import type { TaskRepository } from './repository.ts';
import { recurrenceInput, taskInput, TaskInputError } from './validation.ts';
import { buildTaskView } from './view.ts';

export type TaskTransaction = <T>(operation: (now: Date) => T) => T;

export function createTaskService(repository: TaskRepository, transaction: TaskTransaction, nextId: () => string,
  onComplete: (task: Task, now: Date) => void = () => {},
  onCreate: (subject: string, repeating: boolean, input: unknown) => void = () => {},
  onReopen: (task: Task, now: Date) => void = () => {}) {
  const tomorrowOf = (today: string) => nextOccurrence(today, 'daily') ?? today;
  return {
    view: () => transaction(now => {
      const today = localDay(now);
      return buildTaskView(today, repository.listPendingTasks(), repository.listRecentHistory(HISTORY_LIMIT),
        repository.listActiveRules(), { today: repository.focus(today), tomorrow: repository.focus(tomorrowOf(today)) });
    }),
    // Replace the focus for today or tomorrow. A new choice must be an open one-off task due by that day;
    // tasks already in the list stay allowed after they are completed.
    setFocus: (input: unknown) => transaction(now => {
      const value = typeof input === 'object' && input !== null ? input as Record<string, unknown> : {};
      const today = localDay(now), tomorrow = tomorrowOf(today);
      const day = value.day === today ? today : value.day === tomorrow ? tomorrow : null;
      if (!day) throw new TaskInputError('Choose a focus for today or tomorrow.');
      const ids = value.taskIds;
      if (!Array.isArray(ids) || ids.length > FOCUS_LIMIT || new Set(ids).size !== ids.length || !ids.every(id => typeof id === 'string')) {
        throw new TaskInputError('Choose up to three different tasks.');
      }
      const kept = new Set(repository.focus(day));
      for (const id of ids as string[]) {
        const task = repository.findTask(id);
        if (!task || task.recurrenceId !== null || (!kept.has(id) && (task.status !== 'pending' || task.plannedDate > day))) {
          throw new TaskInputError('Choose open one-off tasks that are due by that day.');
        }
      }
      repository.replaceFocus(day, ids as string[]);
    }),
    // Move an open one-off task to another date, for example during the evening close.
    reschedule: (id: string, input: unknown): Task | undefined => transaction(now => {
      const plannedDate = typeof input === 'object' && input !== null ? (input as Record<string, unknown>).plannedDate : undefined;
      if (!validDate(plannedDate)) throw new TaskInputError('Choose a valid date.');
      if (plannedDate < localDay(now)) throw new TaskInputError('Choose today or a later date.');
      const task = repository.findTask(id);
      if (!task) return undefined;
      if (task.status !== 'pending' || task.recurrenceId !== null) throw new TaskInputError('Only an open one-off task can move to another date.');
      repository.rescheduleTask(id, plannedDate);
      return repository.findTask(id);
    }),
    add: (input: unknown): Task => transaction(now => {
      const { title, plannedDate } = taskInput(input);
      const task: Task = {
        id: nextId(), title, plannedDate, status: 'pending',
        createdAt: now.toISOString(), resolvedAt: null, recurrenceId: null, frequency: null,
      };
      repository.insertTask(task);
      onCreate(task.id, false, input);
      return task;
    }),
    addRecurrence: (input: unknown): RecurrenceRule => transaction(now => {
      const { title, plannedDate, frequency, weekdays } = recurrenceInput(input, localDay(now));
      const value = input as Record<string, unknown>;
      // Clients predating categories treated every repeating schedule as a habit.
      const category = value.category ?? 'habit';
      if (category !== 'habit' && category !== 'task' || category === 'task' && value.habit === true) {
        throw new TaskInputError('Choose a valid activity category.');
      }
      if (category === 'habit' && !HABIT_FREQUENCIES.includes(frequency)) throw new TaskInputError('Habits repeat daily or weekly.');
      const firstDate = weekdays === null ? plannedDate : firstSelectedDate(plannedDate, weekdays);
      if (firstDate === null) throw new TaskInputError('No selected weekday remains in the supported date range.');
      const rule: RecurrenceRule = {
        id: nextId(), title, category, frequency, weekdays, startDate: plannedDate,
        nextDate: nextScheduledDate(firstDate, frequency, weekdays, scheduleDay({ startDate: plannedDate })), createdAt: now.toISOString(), stoppedAt: null,
      };
      repository.insertRule(rule);
      repository.insertTask({
        id: nextId(), title, plannedDate: firstDate, status: 'pending', createdAt: now.toISOString(),
        resolvedAt: null, recurrenceId: rule.id, frequency,
      });
      onCreate(rule.id, true, input);
      return rule;
    }),
    stopRecurrence: (id: string): RecurrenceRule | undefined => transaction(now => {
      const rule = repository.findRule(id);
      if (!rule) return undefined;
      repository.stopRule(id, now.toISOString());
      repository.cancelFutureTasks(id, localDay(now), now.toISOString());
      return repository.findRule(id);
    }),
    resolve: (id: string, status: unknown): Task | undefined => transaction(now => {
      if (status !== 'completed' && status !== 'cancelled') throw new TaskInputError('Choose complete or cancel.');
      const task = repository.findTask(id);
      if (!task) return undefined;
      if (task.status !== 'pending' && task.status !== status) {
        throw new TaskInputError('This task is already resolved. Refresh to see its current period.');
      }
      if (task.status === 'pending' && status === 'completed') onComplete(task, now);
      repository.resolveTask(id, status, now.toISOString());
      return repository.findTask(id);
    }),
    // Undo a completion or cancellation. A repeating occurrence can return only while its
    // period is current, and a stopped schedule never brings back a future occurrence.
    reopen: (id: string): Task | undefined => transaction(now => {
      const task = repository.findTask(id);
      if (!task) return undefined;
      if (task.status === 'pending') return task;
      if (task.status === 'missed') throw new TaskInputError('A missed occurrence stays in History.');
      if (task.recurrenceId !== null) {
        const today = localDay(now);
        const rule = repository.findRule(task.recurrenceId);
        const end = rule ? occurrenceEnd(task, rule) : today;
        if (!rule || (end !== null && end <= today) || (rule.stoppedAt !== null && task.plannedDate > today)) {
          throw new TaskInputError('Only the current occurrence of a repeating task can be reopened.');
        }
      }
      if (task.status === 'completed') onReopen(task, now);
      repository.reopenResolvedTask(id);
      return repository.findTask(id);
    }),
  };
}
