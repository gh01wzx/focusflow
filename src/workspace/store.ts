import { randomUUID } from 'node:crypto';
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

export async function openWorkspaceStore(path: string, clock: () => Date = () => new Date()) {
  const db = await openDatabase(path);
  try {
    const repository = createTaskRepository(db);
    const taskTransaction: TaskTransaction = operation => inTransaction(db, () => {
      const now = clock();
      reconcileRecurrences(repository, now, randomUUID);
      return operation(now);
    });
    const projectTransaction: ProjectTransaction = operation => inTransaction(db, () => operation(clock()));
    return {
      tasks: createTaskService(repository, taskTransaction, randomUUID),
      projects: createProjectService(createProjectRepository(db), projectTransaction, randomUUID),
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
