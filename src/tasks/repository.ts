import type { DatabaseSync } from 'node:sqlite';
import { parseTask, parseRecurrenceRule } from '../shared/task-codec.ts';
import type { RecurrenceRule, Task, TaskResolution } from '../shared/tasks.ts';

// SQL and row decoding stay here. Business rules belong to the service.
export function createTaskRepository(db: DatabaseSync) {
  const taskColumns = `SELECT t.id,t.title,t.planned_date AS plannedDate,t.status,t.created_at AS createdAt,
    t.resolved_at AS resolvedAt,t.recurrence_id AS recurrenceId,r.frequency
    FROM tasks t LEFT JOIN recurrence_rules r ON r.id=t.recurrence_id`;
  const ruleColumns = `SELECT id,title,frequency,start_date AS startDate,next_date AS nextDate,
    created_at AS createdAt,stopped_at AS stoppedAt FROM recurrence_rules`;

  const tasks = db.prepare(taskColumns + ' ORDER BY t.planned_date,t.created_at,t.id');
  const taskById = db.prepare(taskColumns + ' WHERE t.id=?');
  const ruleById = db.prepare(ruleColumns + ' WHERE id=?');
  const activeRules = db.prepare(ruleColumns + ' WHERE stopped_at IS NULL ORDER BY created_at,id');
  const dueRules = db.prepare(ruleColumns + ' WHERE stopped_at IS NULL AND next_date<=?');
  const pendingOccurrences = db.prepare(taskColumns + " WHERE t.status='pending' AND t.recurrence_id IS NOT NULL");
  const insertTask = db.prepare('INSERT INTO tasks(id,title,planned_date,status,created_at,resolved_at,recurrence_id) VALUES(?,?,?,?,?,?,?)');
  const insertRule = db.prepare('INSERT INTO recurrence_rules(id,title,frequency,start_date,next_date,created_at,stopped_at) VALUES(?,?,?,?,?,?,?)');
  const expire = db.prepare("UPDATE tasks SET status='missed',resolved_at=? WHERE id=?");
  const advance = db.prepare('UPDATE recurrence_rules SET next_date=? WHERE id=?');
  const stop = db.prepare('UPDATE recurrence_rules SET stopped_at=? WHERE id=? AND stopped_at IS NULL');
  const cancelFuture = db.prepare("UPDATE tasks SET status='cancelled',resolved_at=? WHERE recurrence_id=? AND status='pending' AND planned_date>?");
  const resolve = db.prepare("UPDATE tasks SET status=?, resolved_at=? WHERE id=? AND status='pending'");

  return {
    listTasks: () => tasks.all().map(parseTask),
    listActiveRules: () => activeRules.all().map(parseRecurrenceRule),
    listDueRules: (today: string) => dueRules.all(today).map(parseRecurrenceRule),
    listPendingOccurrences: () => pendingOccurrences.all().map(parseTask),
    findTask(id: string): Task | undefined {
      const row = taskById.get(id);
      return row === undefined ? undefined : parseTask(row);
    },
    findRule(id: string): RecurrenceRule | undefined {
      const row = ruleById.get(id);
      return row === undefined ? undefined : parseRecurrenceRule(row);
    },
    insertTask(task: Task) {
      insertTask.run(task.id, task.title, task.plannedDate, task.status, task.createdAt, task.resolvedAt, task.recurrenceId);
    },
    insertRule(rule: RecurrenceRule) {
      insertRule.run(rule.id, rule.title, rule.frequency, rule.startDate, rule.nextDate, rule.createdAt, rule.stoppedAt);
    },
    expireTask: (id: string, at: string) => { expire.run(at, id); },
    advanceRule: (id: string, date: string | null) => { advance.run(date, id); },
    stopRule: (id: string, at: string) => { stop.run(at, id); },
    cancelFutureTasks: (id: string, today: string, at: string) => { cancelFuture.run(at, id, today); },
    resolveTask: (id: string, status: TaskResolution, at: string) => { resolve.run(status, at, id); },
  };
}

export type TaskRepository = ReturnType<typeof createTaskRepository>;
