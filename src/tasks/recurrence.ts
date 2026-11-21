import { localDay } from '../shared/calendar.ts';
import { nextScheduledDate, occurrenceEnd, periodEnd, scheduleDay } from '../shared/weekdays.ts';
import type { TaskRepository } from './repository.ts';

// A habit occurrence on a paused day becomes a rest day instead of a miss, so the chain holds.
export function reconcileRecurrences(repository: TaskRepository, now: Date, nextId: () => string, reachedTarget: (task: ReturnType<TaskRepository['listPendingOccurrences']>[number]) => boolean = () => false,
  paused: (day: string) => boolean = () => false): void {
  const today = localDay(now);
  const timestamp = now.toISOString();
  // An occurrence planned for today or later cannot have reached the end of its period.
  for (const task of repository.listPendingOccurrences(today)) {
    if (task.frequency === null) throw new Error('Repeating task has no frequency.');
    const rule = repository.findRule(task.recurrenceId!);
    if (!rule) throw new Error('Repeating task has no schedule.');
    const end = occurrenceEnd(task, rule);
    if (end !== null && end <= today) {
      if (reachedTarget(task)) repository.resolveTask(task.id, 'completed', timestamp);
      else if (task.category === 'habit' && paused(task.plannedDate)) repository.resolveTask(task.id, 'cancelled', timestamp);
      else repository.expireTask(task.id, timestamp);
    }
  }

  for (const rule of repository.listDueRules(today)) {
    const day = scheduleDay(rule);
    let date = rule.nextDate;
    while (date !== null && date <= today) {
      const end = periodEnd(date, rule.frequency, rule.weekdays, day);
      const missed = end !== null && end <= today;
      const rest = rule.category === 'habit' && paused(date);
      repository.insertTask({
        id: nextId(), title: rule.title, plannedDate: date,
        status: rest ? 'cancelled' : missed ? 'missed' : 'pending', createdAt: timestamp,
        resolvedAt: rest || missed ? timestamp : null, recurrenceId: rule.id, frequency: rule.frequency,
      });
      date = nextScheduledDate(date, rule.frequency, rule.weekdays, day);
    }
    repository.advanceRule(rule.id, date);
  }
}
