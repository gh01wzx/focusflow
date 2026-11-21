import type { DatabaseSync } from 'node:sqlite';
import { identityKey, outcomeOf } from '../shared/habits.ts';
import type { ActivityEntry, Outcome, Reward, ScoringRule } from '../shared/personal.ts';
import type { TaskStatus } from '../shared/tasks.ts';

const entryColumns = 'id,kind,subject,title,day,logged_at AS loggedAt,minutes,rate,amount,reference,unit';
const ruleColumns = 'subject,mode,rate,target,cue,identity,plan_time AS time,place,starter,bundle,unit,start_amount AS start,maintain_amount AS maintain,goal_id AS goalId,times_per_week AS timesPerWeek';
const rewardColumns = 'r.id,r.title,r.cost,r.note,r.once_only AS onceOnly,r.archived';
const activeRedemption = `p.kind='redeem' AND p.subject=r.id AND NOT EXISTS (
  SELECT 1 FROM personal_entries x WHERE x.reference=p.id AND x.kind='reverse')`;
// Scoring subjects that the current Personal view can show: open one-off tasks,
// active schedules and schedules that still have an open occurrence.
const currentSubjects = `SELECT id FROM visible_tasks WHERE status='pending' AND recurrence_id IS NULL
  UNION SELECT recurrence_id FROM visible_tasks WHERE status='pending' AND recurrence_id IS NOT NULL
  UNION SELECT id FROM recurrence_rules WHERE stopped_at IS NULL`;

export function createPersonalRepository(db: DatabaseSync) {
  const rewardsQuery = `SELECT ${rewardColumns}, EXISTS(SELECT 1 FROM personal_entries p WHERE ${activeRedemption}) AS used FROM personal_rewards r`;
  const ruleBySubject = db.prepare(`SELECT ${ruleColumns} FROM personal_scoring WHERE subject=?`);
  const currentRules = db.prepare(`SELECT ${ruleColumns} FROM personal_scoring WHERE subject IN (${currentSubjects})`);
  const upsertRule = db.prepare(`INSERT INTO personal_scoring(subject,mode,rate,target,cue,identity,plan_time,place,starter,bundle,unit,start_amount,maintain_amount,goal_id,times_per_week)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(subject) DO UPDATE SET mode=excluded.mode,rate=excluded.rate,target=excluded.target,
    cue=excluded.cue,identity=excluded.identity,plan_time=excluded.plan_time,place=excluded.place,starter=excluded.starter,bundle=excluded.bundle,unit=excluded.unit,
    start_amount=excluded.start_amount,maintain_amount=excluded.maintain_amount,goal_id=excluded.goal_id,times_per_week=excluded.times_per_week`);
  // Reversing an earning reduces earned points. Reversing a redemption does not.
  const earnedEntry = `kind IN ('earn','edit') OR (kind='reverse' AND EXISTS (
    SELECT 1 FROM personal_entries original WHERE original.id=p.reference AND original.kind='earn'))`;
  const dailyPoints = db.prepare(`SELECT day, SUM(amount) AS points FROM personal_entries p
    WHERE day BETWEEN ? AND ? AND (${earnedEntry})
    GROUP BY day`);
  const rewardById = db.prepare(rewardsQuery + ' WHERE r.id=?');
  const allRewards = db.prepare(rewardsQuery + ' ORDER BY r.title,r.id');
  const entryById = db.prepare('SELECT ' + entryColumns + ' FROM personal_entries WHERE id=?');
  const entryAdjustments = db.prepare('SELECT ' + entryColumns + ' FROM personal_entries WHERE reference=? ORDER BY rowid');
  const recentEntries = db.prepare('SELECT ' + entryColumns + ' FROM personal_entries ORDER BY logged_at DESC, rowid DESC LIMIT 150');
  const completionCredit = db.prepare(`SELECT ${entryColumns} FROM personal_entries e
    WHERE e.subject=? AND e.kind='earn' AND e.minutes=0
      AND NOT EXISTS (SELECT 1 FROM personal_entries x WHERE x.reference=e.id AND x.kind='reverse')
    ORDER BY e.rowid DESC LIMIT 1`);
  const weekMinutes = db.prepare(`SELECT COALESCE(t.recurrence_id,p.subject) AS habit, p.day, SUM(p.minutes) AS minutes
    FROM personal_entries p JOIN tasks t ON t.id=p.subject
    WHERE p.day BETWEEN ? AND ? AND p.minutes<>0
    GROUP BY habit,p.day HAVING SUM(p.minutes)>0`);
  const dayTotals = db.prepare(`SELECT COALESCE(SUM(amount),0) AS balance,
    COALESCE(SUM(CASE WHEN day=? AND (${earnedEntry}) THEN amount ELSE 0 END),0) AS earned
    FROM personal_entries p`);
  const subjectMinutes = db.prepare(`SELECT COALESCE(SUM(minutes),0) AS total FROM personal_entries
    WHERE subject=? AND kind IN ('earn','edit','reverse')`);
  const openProgress = db.prepare(`SELECT subject,SUM(minutes) AS minutes FROM personal_entries
    WHERE subject IN (SELECT id FROM visible_tasks WHERE status='pending')
      AND kind IN ('earn','edit','reverse') AND minutes<>0
    GROUP BY subject HAVING SUM(minutes)>0`);
  // Only missed or still-open occurrences need their logs to decide the outcome.
  // The subject index finds their entries, including corrections and undos.
  const occurrenceMinutes = `(SELECT SUM(p.minutes) FROM personal_entries p
    WHERE p.subject=t.id AND p.kind IN ('earn','edit','reverse'))`;
  const recentOccurrences = db.prepare(`SELECT t.recurrence_id AS habit, t.planned_date AS day, t.status,
      CASE WHEN t.status='missed' THEN COALESCE(${occurrenceMinutes},0) ELSE 0 END AS minutes
    FROM visible_tasks t WHERE t.recurrence_id IS NOT NULL AND t.status IN ('completed','cancelled','missed')
      AND t.planned_date BETWEEN ? AND ?`);
  // Visit only occurrences of rules with an identity. CROSS JOIN keeps this index
  // lookup inside the rule loop even on a database without planner statistics.
  const identityVotes = db.prepare(`SELECT s.identity, COUNT(*) AS votes
    FROM personal_scoring s CROSS JOIN visible_tasks t ON (t.recurrence_id=s.subject OR (t.id=s.subject AND t.recurrence_id IS NULL))
    WHERE s.identity<>'' AND (t.status='completed' OR (t.status IN ('pending','missed') AND ${occurrenceMinutes}>0))
    GROUP BY s.identity`);
  const identityList = db.prepare("SELECT DISTINCT identity FROM personal_scoring WHERE identity<>'' ORDER BY identity COLLATE NOCASE, identity");
  const storedPreferences = db.prepare("SELECT value FROM personal_preferences WHERE key='settings'");
  function reward(row: Record<string, unknown>): Reward {
    return { id: String(row.id), title: String(row.title), cost: Number(row.cost), note: String(row.note),
      onceOnly: !!row.onceOnly, archived: !!row.archived, used: !!row.used };
  }
  return {
    rule(subject: string) {
      return ruleBySubject.get(subject) as ScoringRule | undefined;
    },
    identities() {
      const names = new Map<string, string>();
      for (const row of identityList.all()) {
        const name = String(row.identity), key = identityKey(name);
        if (key && !names.has(key)) names.set(key, name);
      }
      return [...names.values()];
    },
    rules() { return currentRules.all() as unknown as ScoringRule[]; },
    saveRule(rule: ScoringRule) {
      upsertRule.run(rule.subject, rule.mode, rule.rate, rule.target, rule.cue, rule.identity, rule.time, rule.place,
        rule.starter, rule.bundle, rule.unit ?? 'minutes', rule.start ?? null, rule.maintain ?? null, rule.goalId ?? null, rule.timesPerWeek ?? null);
    },
    reward(id: string) {
      const row = rewardById.get(id);
      return row ? reward(row) : undefined;
    },
    rewards() { return allRewards.all().map(reward); },
    saveReward(value: Omit<Reward, 'used'>) {
      db.prepare(`INSERT INTO personal_rewards VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET
        title=excluded.title,cost=excluded.cost,note=excluded.note,once_only=excluded.once_only,archived=excluded.archived`)
        .run(value.id, value.title, value.cost, value.note, Number(value.onceOnly), Number(value.archived));
    },
    entry(id: string) {
      return entryById.get(id) as ActivityEntry | undefined;
    },
    adjustments(id: string) {
      return entryAdjustments.all(id) as unknown as ActivityEntry[];
    },
    entries() {
      return recentEntries.all() as unknown as ActivityEntry[];
    },
    // The latest completion credit for a task that has not been undone.
    activeCompletion(subject: string) {
      return completionCredit.get(subject) as ActivityEntry | undefined;
    },
    insert(entry: ActivityEntry, now: Date) {
      db.prepare('INSERT INTO personal_entries(id,kind,subject,title,day,logged_at,time_zone,offset_minutes,minutes,rate,amount,reference,unit) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)')
        .run(entry.id, entry.kind, entry.subject, entry.title, entry.day, entry.loggedAt,
          Intl.DateTimeFormat().resolvedOptions().timeZone, now.getTimezoneOffset(), entry.minutes, entry.rate, entry.amount, entry.reference, entry.unit ?? 'minutes');
    },
    moveActivity(entry: ActivityEntry, day: string, subject: string, operation: string) {
      db.prepare('UPDATE personal_entries SET day=?,subject=? WHERE id=? OR reference=?').run(day, subject, entry.id, entry.id);
      db.prepare('INSERT INTO personal_date_corrections VALUES (?,?,?)').run(operation, entry.day, entry.subject);
    },
    week(start: string, end: string) {
      const result: Record<string, Record<string, number>> = {};
      for (const row of weekMinutes.all(start, end)) (result[String(row.habit)] ??= {})[String(row.day)] = Number(row.minutes);
      return result;
    },
    // Habit -> day -> outcome for resolved occurrences planned between the two dates.
    recent(start: string, end: string) {
      const result: Record<string, Record<string, Outcome>> = {};
      for (const row of recentOccurrences.all(start, end)) {
        const outcome = outcomeOf(String(row.status) as TaskStatus, Number(row.minutes));
        if (outcome) (result[String(row.habit)] ??= {})[String(row.day)] = outcome;
      }
      return result;
    },
    votes() {
      const result: Record<string, number> = Object.create(null);
      for (const row of identityVotes.all()) {
        const key = identityKey(String(row.identity));
        result[key] = (result[key] ?? 0) + Number(row.votes);
      }
      return result;
    },
    weekPoints(start: string, end: string) {
      return Object.fromEntries(dailyPoints.all(start, end).map(row => [String(row.day), Number(row.points)]));
    },
    totals(day: string) {
      const row = dayTotals.get(day)!;
      return { balance: Number(row.balance), earned: Number(row.earned) };
    },
    hasActivity(subject: string) {
      return !!db.prepare('SELECT 1 FROM personal_entries WHERE subject=? LIMIT 1').get(subject);
    },
    minutes(subject: string) {
      return Number(subjectMinutes.get(subject)?.total);
    },
    // Days whose logged amount reaches the minimum, for a flexible weekly habit.
    sessions(subject: string, minimum: number) {
      return Number(db.prepare("SELECT COUNT(*) AS days FROM (SELECT day FROM personal_entries WHERE subject=? AND kind IN ('earn','edit','reverse') GROUP BY day HAVING SUM(minutes)>=?)").get(subject, minimum)?.days ?? 0);
    },
    minutesOn(subject: string, day: string) {
      return Number(db.prepare("SELECT COALESCE(SUM(minutes),0) AS total FROM personal_entries WHERE subject=? AND day=? AND kind IN ('earn','edit','reverse')").get(subject, day)?.total ?? 0);
    },
    // Minutes logged against open occurrences. Resolved occurrences keep their entries in History.
    progress() {
      return Object.fromEntries(openProgress.all().map(row => [String(row.subject), Number(row.minutes)]));
    },
    preferences() {
      return storedPreferences.get()?.value;
    },
    // Amount logged per habit schedule and day, and each occurrence's status, from a day on.
    dailyAmounts(from: string) {
      return db.prepare("SELECT t.recurrence_id AS habit, p.day, SUM(p.minutes) AS amount FROM personal_entries p JOIN tasks t ON t.id=p.subject WHERE t.recurrence_id IS NOT NULL AND p.day>=? AND p.kind IN ('earn','edit','reverse') GROUP BY habit, p.day")
        .all(from).map(row => ({ habit: String(row.habit), day: String(row.day), amount: Number(row.amount) }));
    },
    occurrenceStatuses(from: string) {
      return db.prepare('SELECT recurrence_id AS habit, planned_date AS day, status FROM visible_tasks WHERE recurrence_id IS NOT NULL AND planned_date>=?')
        .all(from).map(row => ({ habit: String(row.habit), day: String(row.day), status: String(row.status) }));
    },
    // Habit schedules that are not deleted, stopped ones included, with their scoring.
    habitSchedules() {
      return db.prepare("SELECT r.id, r.title, r.stopped_at AS stoppedAt, s.mode, s.target, s.unit, s.start_amount AS start, s.maintain_amount AS maintain FROM recurrence_rules r LEFT JOIN personal_scoring s ON s.subject=r.id WHERE r.category='habit' AND r.removed=0 ORDER BY r.stopped_at IS NOT NULL, r.created_at")
        .all().map(row => ({ id: String(row.id), title: String(row.title), stoppedAt: row.stoppedAt === null ? null : String(row.stoppedAt),
          mode: row.mode === 'minutes' ? 'minutes' as const : 'complete' as const, target: Number(row.target ?? 0), unit: row.unit === 'count' ? 'count' as const : 'minutes' as const,
          start: row.start === null ? null : Number(row.start), maintain: row.maintain === null ? null : Number(row.maintain) }));
    },
    // Paused stretches, as local start and end days.
    pauses() {
      return db.prepare('SELECT id,start_date AS start,end_date AS end,created_at AS createdAt FROM habit_pauses ORDER BY start_date').all()
        .map(row => ({ id: String(row.id), start: String(row.start), end: String(row.end), createdAt: String(row.createdAt) }));
    },
    insertPause(pause: { id: string; start: string; end: string; createdAt: string }) {
      db.prepare('INSERT INTO habit_pauses(id,start_date,end_date,created_at) VALUES(?,?,?,?)').run(pause.id, pause.start, pause.end, pause.createdAt);
    },
    // Ends every pause from this day on: earlier days stay paused, later ones are removed.
    endPausesFrom(day: string, yesterday: string) {
      db.prepare('DELETE FROM habit_pauses WHERE start_date>=?').run(day);
      db.prepare('UPDATE habit_pauses SET end_date=? WHERE end_date>=?').run(yesterday, day);
    },
    activeGoal(id: string) { return !!db.prepare("SELECT 1 FROM personal_goals WHERE id=? AND status='active'").get(id); },
    savePreferences(json: string) {
      db.prepare("INSERT INTO personal_preferences VALUES ('settings',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(json);
    },
  };
}

export type PersonalRepository = ReturnType<typeof createPersonalRepository>;
