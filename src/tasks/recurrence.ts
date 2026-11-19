import { localDay } from '../shared/calendar.ts';
import { nextScheduledDate, occurrenceEnd, periodEnd, scheduleDay } from '../shared/weekdays.ts';
import type { TaskRepository } from './repository.ts';

export function reconcileRecurrences(repository: TaskRepository, now: Date, nextId: () => string, reachedTarget: (task: ReturnType<TaskRepository['listPendingOccurrences']>[number]) => boolean = () => false): void {
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
      else repository.expireTask(task.id, timestamp);
    }
  }

  for (const rule of repository.listDueRules(today)) {
    const day = scheduleDay(rule);
    let date = rule.nextDate;
    while (date !== null && date <= today) {
      const end = periodEnd(date, rule.frequency, rule.weekdays, day);
      const missed = end !== null && end <= today;
      repository.insertTask({
        id: nextId(), title: rule.title, plannedDate: date,
        status: missed ? 'missed' : 'pending', createdAt: timestamp,
        resolvedAt: missed ? timestamp : null, recurrenceId: rule.id, frequency: rule.frequency,
      });
      date = nextScheduledDate(date, rule.frequency, rule.weekdays, day);
    }
    repository.advanceRule(rule.id, date);
  }
}
