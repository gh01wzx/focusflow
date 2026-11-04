import { localDay, nextOccurrence } from '../shared/calendar.ts';
import type { TaskRepository } from './repository.ts';

export function reconcileRecurrences(repository: TaskRepository, now: Date, nextId: () => string): void {
  const today = localDay(now);
  const timestamp = now.toISOString();
  for (const task of repository.listPendingOccurrences()) {
    if (task.frequency === null) throw new Error('Repeating task has no frequency.');
    const end = nextOccurrence(task.plannedDate, task.frequency);
    if (end !== null && end <= today) repository.expireTask(task.id, timestamp);
  }

  for (const rule of repository.listDueRules(today)) {
    let date = rule.nextDate;
    while (date !== null && date <= today) {
      const end = nextOccurrence(date, rule.frequency);
      const missed = end !== null && end <= today;
      repository.insertTask({
        id: nextId(), title: rule.title, plannedDate: date,
        status: missed ? 'missed' : 'pending', createdAt: timestamp,
        resolvedAt: missed ? timestamp : null, recurrenceId: rule.id, frequency: rule.frequency,
      });
      date = end;
    }
    repository.advanceRule(rule.id, date);
  }
}
