import { defaultInterface, isInterface } from '../shared/interface.ts';
import type { InterfaceSettings } from '../shared/interface.ts';
import { createProjectSettings } from '../projects/settings.ts';
import { createPersonalRepository } from '../tasks/personal-repository.ts';
import { createPersonalService } from '../tasks/personal-service.ts';
import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { createSnapshot } from '../database/backup.ts';
import { exportPointRows, exportTables, exportTaskRows } from '../database/export.ts';
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
import { createSomeday, createSomedayRepository } from '../tasks/someday.ts';

export async function openWorkspaceStore(path: string, clock: () => Date = () => new Date()) {
  const db = await openDatabase(path);
  try {
    const repository = createTaskRepository(db);
    const taskTransaction: TaskTransaction = operation => inTransaction(db, () => {
      const now = clock();
      const pauses = personalRepository.pauses();
      reconcileRecurrences(repository, now, randomUUID, personal.reachedTarget, day => pauses.some(pause => pause.start <= day && day <= pause.end));
      return operation(now);
    });
    const personalRepository = createPersonalRepository(db);
    const personal = createPersonalService(personalRepository, repository, taskTransaction);
    const projectTransaction: ProjectTransaction = operation => inTransaction(db, () => operation(clock()));
    const projectRepository = createProjectRepository(db);
    const planDrafts = createPlanRepository(db);
    const tasks = createTaskService(repository, taskTransaction, randomUUID, personal.complete, personal.createRule, personal.reopen);
    return {
      tasks,
      someday: createSomeday(createSomedayRepository(db), tasks.add, randomUUID, clock),
      personal,
      interfaceSettings() {
        const row = db.prepare("SELECT value FROM personal_preferences WHERE key='interface'").get();
        const { sound, volume, reducedMotion } = personal.preferences();
        const value: unknown = { ...(row ? JSON.parse(String(row.value)) : defaultInterface), sound, volume, reducedMotion };
        return isInterface(value) ? value : defaultInterface;
      },
      saveInterface(settings: InterfaceSettings) {
        inTransaction(db, () => {
          const { language, start, size, sound, volume, reducedMotion } = settings;
          db.prepare("INSERT INTO personal_preferences(key,value) VALUES('interface',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value")
            .run(JSON.stringify({ language, start, size }));
          personalRepository.savePreferences(JSON.stringify({ ...personal.preferences(), sound, volume, reducedMotion }));
        });
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
      snapshot(name?: string) {
        taskTransaction(() => {});
        return createSnapshot(db, join(dirname(path), 'backups'), undefined, name);
      },
      backupDirectory: join(dirname(path), 'backups'),
      exportTables: () => exportTables(db),
      exportTaskRows: () => exportTaskRows(db),
      exportPointRows: () => exportPointRows(db),
      // Backup folder and reminder choices, kept with the data so they follow its profile.
      careSettings(): unknown {
        const row = db.prepare("SELECT value FROM personal_preferences WHERE key='care'").get();
        return row ? JSON.parse(String(row.value)) : null;
      },
      saveCareSettings(value: unknown) {
        db.prepare("INSERT INTO personal_preferences(key,value) VALUES('care',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(JSON.stringify(value));
      },
      close: () => db.close(),
    };
  } catch (error) {
    db.close();
    throw error;
  }
}
