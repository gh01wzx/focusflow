import type { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { inTransaction } from '../database/connection.ts';
import { localDay, nextOccurrence } from '../shared/calendar.ts';
import { createTaskRepository } from '../tasks/repository.ts';
import { createTaskService } from '../tasks/service.ts';
import type { TaskTransaction } from '../tasks/service.ts';
import { createProjectRepository } from '../projects/repository.ts';
import { createProjectService } from '../projects/service.ts';

export function seedSampleData(db: DatabaseSync, now: Date): void {
  inTransaction(db, () => {
    // The outer transaction makes all examples one atomic initial write.
    const transaction: TaskTransaction = operation => operation(now);
    const tasks = createTaskService(createTaskRepository(db), transaction, randomUUID);
    const projects = createProjectService(createProjectRepository(db), transaction, randomUUID);
    const today = localDay(now);
    tasks.add({ title: 'Try completing this sample task', plannedDate: today });
    tasks.add({ title: 'A sample task for tomorrow', plannedDate: nextOccurrence(today, 'daily') });
    tasks.addRecurrence({ title: 'Sample daily check-in', plannedDate: today, frequency: 'daily' });
    const project = projects.addProject({ title: 'Sample project', description: 'Practice here without changing everyday work.' });
    const milestone = projects.addMilestone({ projectId: project.id, title: 'Try the workflow', description: '' });
    const ticket = projects.addTicket({ milestoneId: milestone.id, title: 'Move this sample ticket',
      description: 'Change its status, close the app, and check that your change is saved.',
      acceptanceCriteria: 'The chosen status remains after reopening this sample workspace.' });
    projects.setStatus(ticket.id, 'ready');
  });
}
