import { localDay, nextOccurrence } from '../shared/calendar.ts';
import { nextScheduledDate } from '../shared/weekdays.ts';
import type { TaskRepository } from './repository.ts';

export function reconcileRecurrences(repository: TaskRepository, now: Date, nextId: () => string, reachedTarget: (task: ReturnType<TaskRepository['listPendingOccurrences']>[number]) => boolean = () => false): void {
  const today = localDay(now);
  const timestamp = now.toISOString();
  for (const task of repository.listPendingOccurrences()) {
    if (task.frequency === null) throw new Error('Repeating task has no frequency.');
    const rule = repository.findRule(task.recurrenceId!);
    if (!rule) throw new Error('Repeating task has no schedule.');
    const end = nextOccurrence(task.plannedDate, rule.weekdays === null ? task.frequency : 'daily');
    if (end !== null && end <= today) {
      if (reachedTarget(task)) repository.resolveTask(task.id, 'completed', timestamp);
      else repository.expireTask(task.id, timestamp);
    }
  }

  for (const rule of repository.listDueRules(today)) {
    let date = rule.nextDate;
    while (date !== null && date <= today) {
      const end = nextOccurrence(date, rule.weekdays === null ? rule.frequency : 'daily');
      const missed = end !== null && end <= today;
      repository.insertTask({
        id: nextId(), title: rule.title, plannedDate: date,
        status: missed ? 'missed' : 'pending', createdAt: timestamp,
        resolvedAt: missed ? timestamp : null, recurrenceId: rule.id, frequency: rule.frequency,
      });
      date = nextScheduledDate(date, rule.frequency, rule.weekdays);
    }
    repository.advanceRule(rule.id, date);
  }
}
