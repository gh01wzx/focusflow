import { defaultInterface, isInterface } from '../shared/interface.ts';
import type { InterfaceSettings } from '../shared/interface.ts';
import { createProjectSettings } from '../projects/settings.ts';
import { createPersonalRepository } from '../tasks/personal-repository.ts';
import { createPersonalService } from '../tasks/personal-service.ts';
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
import { createPlanRepository, createPlanApprovalRepository } from '../plans/repository.ts';
import { createPlanApprovalService } from '../plans/approval.ts';
import { createPublicationRepository } from '../publication/repository.ts';
import { createLinkedWorkRepository } from '../sync/repository.ts';
import { createExecutionRepository } from '../execution/repository.ts';

export async function openWorkspaceStore(path: string, clock: () => Date = () => new Date()) {
  const db = await openDatabase(path);
  try {
    const repository = createTaskRepository(db);
    const taskTransaction: TaskTransaction = operation => inTransaction(db, () => {
      const now = clock();
      reconcileRecurrences(repository, now, randomUUID, personal.reachedTarget);
      return operation(now);
    });
    const personal = createPersonalService(createPersonalRepository(db), repository, taskTransaction);
    const projectTransaction: ProjectTransaction = operation => inTransaction(db, () => operation(clock()));
    const projectRepository = createProjectRepository(db);
    const planDrafts = createPlanRepository(db);
    return {
      tasks: createTaskService(repository, taskTransaction, randomUUID, personal.complete, personal.createRule, personal.reopen),
      personal,
      interfaceSettings() {
        const row = db.prepare("SELECT value FROM personal_preferences WHERE key='interface'").get();
        const value: unknown = row ? JSON.parse(String(row.value)) : defaultInterface;
        return isInterface(value) ? value : defaultInterface;
      },
      saveInterface(settings: InterfaceSettings) {
        db.prepare("INSERT INTO personal_preferences(key,value) VALUES('interface',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value")
          .run(JSON.stringify({ language: settings.language, start: settings.start, size: settings.size }));
      },
      projects: createProjectService(projectRepository, projectTransaction, randomUUID),
      planDrafts,
      publications: createPublicationRepository(db),
      linkedWork: createLinkedWorkRepository(db),
      execution: createExecutionRepository(db),
      projectRepository,
      projectSettings: createProjectSettings(db),
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
