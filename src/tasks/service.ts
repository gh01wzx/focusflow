import { localDay } from '../shared/calendar.ts';
import { firstSelectedDate, nextScheduledDate } from '../shared/weekdays.ts';
import type { RecurrenceRule, Task } from '../shared/tasks.ts';
import type { TaskRepository } from './repository.ts';
import { recurrenceInput, taskInput, TaskInputError } from './validation.ts';
import { buildTaskView } from './view.ts';

export type TaskTransaction = <T>(operation: (now: Date) => T) => T;

export function createTaskService(repository: TaskRepository, transaction: TaskTransaction, nextId: () => string) {
  return {
    view: () => transaction(now => buildTaskView(
      localDay(now), repository.listTasks(), repository.listActiveRules(),
    )),
    add: (input: unknown): Task => transaction(now => {
      const { title, plannedDate } = taskInput(input);
      const task: Task = {
        id: nextId(), title, plannedDate, status: 'pending',
        createdAt: now.toISOString(), resolvedAt: null, recurrenceId: null, frequency: null,
      };
      repository.insertTask(task);
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
      repository.resolveTask(id, status, now.toISOString());
      return repository.findTask(id);
    }),
  };
}
