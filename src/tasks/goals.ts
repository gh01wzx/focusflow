import type { DatabaseSync } from 'node:sqlite';
import { GOAL_ACTIONS, quarterOf, quarterRange } from '../shared/goals.ts';
import type { Goal, GoalAction, GoalLink, GoalStatus, GoalsView } from '../shared/goals.ts';
import { TaskInputError } from './validation.ts';

// SQL for quarterly goals and the plans linked to them.
export function createGoalRepository(db: DatabaseSync) {
  const links = db.prepare(`SELECT s.subject, s.goal_id AS goalId, COALESCE(r.title, t.title) AS title,
      CASE WHEN r.category='habit' THEN 1 ELSE 0 END AS habit
    FROM personal_scoring s LEFT JOIN recurrence_rules r ON r.id=s.subject AND r.removed=0
      LEFT JOIN visible_tasks t ON t.id=s.subject AND t.recurrence_id IS NULL
    WHERE s.goal_id IS NOT NULL AND COALESCE(r.title, t.title) IS NOT NULL ORDER BY title`);
  // Completed occurrences and one-off tasks, plus habit days with logged activity.
  const done = db.prepare(`SELECT COUNT(*) AS done FROM visible_tasks t JOIN personal_scoring s ON s.subject=COALESCE(t.recurrence_id, t.id)
    WHERE s.goal_id=? AND t.planned_date BETWEEN ? AND ? AND (t.status='completed'
      OR EXISTS (SELECT 1 FROM personal_entries p WHERE p.subject=t.id AND p.minutes>0))`);
  return {
    list(): Omit<Goal, 'links' | 'done'>[] {
      return db.prepare("SELECT id,title,quarter,status,created_at AS createdAt FROM personal_goals ORDER BY quarter DESC, created_at")
        .all().map(row => ({ id: String(row.id), title: String(row.title), quarter: String(row.quarter),
          status: String(row.status) as GoalStatus, createdAt: String(row.createdAt) }));
    },
    links(): (GoalLink & { goalId: string })[] {
      return links.all().map(row => ({ subject: String(row.subject), goalId: String(row.goalId), title: String(row.title), habit: row.habit === 1 }));
    },
    done(id: string, start: string, end: string) { return Number(done.get(id, start, end)?.done ?? 0); },
    find(id: string) { return this.list().find(goal => goal.id === id); },
    insert(goal: { id: string; title: string; quarter: string; createdAt: string }) {
      db.prepare('INSERT INTO personal_goals(id,title,quarter,created_at) VALUES(?,?,?,?)').run(goal.id, goal.title, goal.quarter, goal.createdAt);
    },
    update(id: string, change: { status: GoalStatus; quarter: string; reviewedAt: string }) {
      db.prepare('UPDATE personal_goals SET status=?,quarter=?,reviewed_at=? WHERE id=?').run(change.status, change.quarter, change.reviewedAt, id);
    },
  };
}

export function createGoals(repository: ReturnType<typeof createGoalRepository>, nextId: () => string, clock: () => Date,
  today: (now: Date) => string) {
  function view(): GoalsView {
    const quarter = quarterOf(today(clock()));
    const links = repository.links();
    return { quarter, goals: repository.list().map(goal => {
      const { start, end } = quarterRange(goal.quarter);
      return { ...goal, links: links.filter(link => link.goalId === goal.id).map(link => ({ subject: link.subject, title: link.title, habit: link.habit })),
        done: repository.done(goal.id, start, end) };
    }) };
  }
  return {
    view,
    add(input: unknown) {
      const title = input && typeof input === 'object' ? (input as Record<string, unknown>).title : undefined;
      if (typeof title !== 'string' || !title.trim() || title.trim().length > 200) throw new TaskInputError('Name the goal in 1 to 200 characters.');
      repository.insert({ id: nextId(), title: title.trim(), quarter: quarterOf(today(clock())), createdAt: clock().toISOString() });
      return view();
    },
    // done and drop close a goal; carry moves an earlier goal into this quarter.
    act(id: string, action: string) {
      const goal = repository.find(id);
      if (!goal || !GOAL_ACTIONS.includes(action as GoalAction)) throw new TaskInputError('Choose a current goal.');
      const now = clock(), quarter = quarterOf(today(now));
      repository.update(id, { status: action === 'done' ? 'done' : action === 'drop' ? 'dropped' : 'active',
        quarter: action === 'carry' ? quarter : goal.quarter, reviewedAt: now.toISOString() });
      return view();
    },
  };
}
export type Goals = ReturnType<typeof createGoals>;
