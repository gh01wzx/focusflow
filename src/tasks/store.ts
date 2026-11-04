import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { createSnapshot } from '../database/backup.ts';
import { openTaskDatabase, inTransaction } from './connection.ts';
import { createTaskRepository } from './repository.ts';
import { reconcileRecurrences } from './recurrence.ts';
import { createTaskService } from './service.ts';
import type { TaskTransaction } from './service.ts';

// Composition and resource ownership only; rules and SQL have separate homes.
export async function openTaskStore(path: string, clock: () => Date = () => new Date()) {
  const db = await openTaskDatabase(path);
  try {
    const repository = createTaskRepository(db);
    const transaction: TaskTransaction = operation => inTransaction(db, () => {
      const now = clock();
      reconcileRecurrences(repository, now, randomUUID);
      return operation(now);
    });
    return {
      ...createTaskService(repository, transaction, randomUUID),
      snapshot() {
        transaction(() => {});
        return createSnapshot(db, join(dirname(path), 'backups'));
      },
      close: () => db.close(),
    };
  } catch (error) {
    db.close();
    throw error;
  }
}

export type TaskStore = Awaited<ReturnType<typeof openTaskStore>>;
