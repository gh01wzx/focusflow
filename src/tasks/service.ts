import { localDay } from '../shared/calendar.ts';
import { firstSelectedDate, nextScheduledDate, periodEnd } from '../shared/weekdays.ts';
import { HISTORY_LIMIT } from '../shared/tasks.ts';
import type { RecurrenceRule, Task } from '../shared/tasks.ts';
import type { TaskRepository } from './repository.ts';
import { recurrenceInput, taskInput, TaskInputError } from './validation.ts';
import { buildTaskView } from './view.ts';

export type TaskTransaction = <T>(operation: (now: Date) => T) => T;

export function createTaskService(repository: TaskRepository, transaction: TaskTransaction, nextId: () => string,
  onComplete: (task: Task, now: Date) => void = () => {},
  onCreate: (subject: string, repeating: boolean, input: unknown) => void = () => {},
  onReopen: (task: Task, now: Date) => void = () => {}) {
  return {
    view: () => transaction(now => buildTaskView(
      localDay(now), repository.listPendingTasks(), repository.listRecentHistory(HISTORY_LIMIT), repository.listActiveRules(),
    )),
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
      const firstDate = weekdays === null ? plannedDate : firstSelectedDate(plannedDate, weekdays);
      if (firstDate === null) throw new TaskInputError('No selected weekday remains in the supported date range.');
      const rule: RecurrenceRule = {
        id: nextId(), title, frequency, weekdays, startDate: plannedDate,
        nextDate: nextScheduledDate(firstDate, frequency, weekdays), createdAt: now.toISOString(), stoppedAt: null,
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
        const end = rule ? periodEnd(task.plannedDate, rule.frequency, rule.weekdays) : today;
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
