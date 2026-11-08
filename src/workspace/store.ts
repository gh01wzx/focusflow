import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createSnapshot } from '../database/backup.ts';
import { openDatabase, inTransaction } from '../database/connection.ts';
import { createTaskRepository } from '../tasks/repository.ts';
import { reconcileRecurrences } from '../tasks/recurrence.ts';
import { createTaskService } from '../tasks/service.ts';
import type { TaskTransaction } from '../tasks/service.ts';
import { createProjectRepository } from '../projects/repository.ts';
import { createProjectService } from '../projects/service.ts';
import type { ProjectTransaction } from '../projects/service.ts';
import { seedSampleData } from './sample-data.ts';
import { createPlanRepository, createPlanApprovalRepository } from '../plans/repository.ts';
import { createPlanApprovalService } from '../plans/approval.ts';
import { createPublicationRepository } from '../publication/repository.ts';
import { createLinkedWorkRepository } from '../sync/repository.ts';

export async function openWorkspaceStore(path: string, clock: () => Date = () => new Date(), sampleData = false) {
  const existed = existsSync(path);
  const db = await openDatabase(path);
  try {
    if (sampleData && !existed) seedSampleData(db, clock());
    const repository = createTaskRepository(db);
    const taskTransaction: TaskTransaction = operation => inTransaction(db, () => {
      const now = clock();
      reconcileRecurrences(repository, now, randomUUID);
      return operation(now);
    });
    const projectTransaction: ProjectTransaction = operation => inTransaction(db, () => operation(clock()));
    const projectRepository = createProjectRepository(db);
    const planDrafts = createPlanRepository(db);
    return {
      tasks: createTaskService(repository, taskTransaction, randomUUID),
      projects: createProjectService(projectRepository, projectTransaction, randomUUID),
      planDrafts,
      publications: createPublicationRepository(db),
      linkedWork: createLinkedWorkRepository(db),
      projectRepository,
      projectTransaction,
      planApproval: createPlanApprovalService(planDrafts, createPlanApprovalRepository(db), projectRepository, projectTransaction, randomUUID),
      snapshot() {
        taskTransaction(() => {});
        return createSnapshot(db, join(dirname(path), 'backups'));
      },
      close: () => db.close(),
    };
  } catch (error) {
    db.close();
    throw error;
  }
}
