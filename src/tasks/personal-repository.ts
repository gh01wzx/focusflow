import type { DatabaseSync } from 'node:sqlite';
import type { ActivityEntry, Reward, ScoringRule } from '../shared/personal.ts';

const entryColumns = 'id,kind,subject,title,day,logged_at AS loggedAt,minutes,rate,amount,reference';
const rewardColumns = 'r.id,r.title,r.cost,r.note,r.once_only AS onceOnly,r.archived';
const activeRedemption = `p.kind='redeem' AND p.subject=r.id AND NOT EXISTS (
  SELECT 1 FROM personal_entries x WHERE x.reference=p.id AND x.kind='reverse')`;

export function createPersonalRepository(db: DatabaseSync) {
  const rewardsQuery = `SELECT ${rewardColumns}, EXISTS(SELECT 1 FROM personal_entries p WHERE ${activeRedemption}) AS used FROM personal_rewards r`;
  function reward(row: Record<string, unknown>): Reward {
    return { id: String(row.id), title: String(row.title), cost: Number(row.cost), note: String(row.note),
      onceOnly: !!row.onceOnly, archived: !!row.archived, used: !!row.used };
  }
  return {
    rule(subject: string) {
      return db.prepare('SELECT * FROM personal_scoring WHERE subject=?').get(subject) as ScoringRule | undefined;
    },
    rules() { return db.prepare('SELECT * FROM personal_scoring').all() as unknown as ScoringRule[]; },
    saveRule(rule: ScoringRule) {
      db.prepare(`INSERT INTO personal_scoring VALUES (?,?,?,?,?) ON CONFLICT(subject) DO UPDATE SET
        mode=excluded.mode,rate=excluded.rate,target=excluded.target,cue=excluded.cue`)
        .run(rule.subject, rule.mode, rule.rate, rule.target, rule.cue);
    },
    reward(id: string) {
      const row = db.prepare(rewardsQuery + ' WHERE r.id=?').get(id);
      return row ? reward(row) : undefined;
    },
    rewards() { return db.prepare(rewardsQuery + ' ORDER BY r.title,r.id').all().map(reward); },
    saveReward(value: Omit<Reward, 'used'>) {
      db.prepare(`INSERT INTO personal_rewards VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET
        title=excluded.title,cost=excluded.cost,note=excluded.note,once_only=excluded.once_only,archived=excluded.archived`)
        .run(value.id, value.title, value.cost, value.note, Number(value.onceOnly), Number(value.archived));
    },
    entry(id: string) {
      return db.prepare('SELECT ' + entryColumns + ' FROM personal_entries WHERE id=?').get(id) as ActivityEntry | undefined;
    },
    adjustments(id: string) {
      return db.prepare('SELECT ' + entryColumns + ' FROM personal_entries WHERE reference=? ORDER BY rowid')
        .all(id) as unknown as ActivityEntry[];
    },
    entries() {
      return db.prepare('SELECT ' + entryColumns + ' FROM personal_entries ORDER BY logged_at DESC, rowid DESC LIMIT 150')
        .all() as unknown as ActivityEntry[];
    },
    insert(entry: ActivityEntry, now: Date) {
      db.prepare('INSERT INTO personal_entries VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
        .run(entry.id, entry.kind, entry.subject, entry.title, entry.day, entry.loggedAt,
          Intl.DateTimeFormat().resolvedOptions().timeZone, now.getTimezoneOffset(), entry.minutes, entry.rate, entry.amount, entry.reference);
    },
    moveActivity(entry: ActivityEntry, day: string, subject: string, operation: string) {
      db.prepare('UPDATE personal_entries SET day=?,subject=? WHERE id=? OR reference=?').run(day, subject, entry.id, entry.id);
      db.prepare('INSERT INTO personal_date_corrections VALUES (?,?,?)').run(operation, entry.day, entry.subject);
    },
    week(start: string, end: string) {
      const rows = db.prepare(`SELECT COALESCE(t.recurrence_id,p.subject) AS habit, p.day, SUM(p.minutes) AS minutes
        FROM personal_entries p JOIN tasks t ON t.id=p.subject
        WHERE p.day BETWEEN ? AND ? AND p.minutes<>0
        GROUP BY habit,p.day HAVING SUM(p.minutes)>0`).all(start, end);
      const result: Record<string, Record<string, number>> = {};
      for (const row of rows) (result[String(row.habit)] ??= {})[String(row.day)] = Number(row.minutes);
      return result;
    },
    totals(day: string) {
      const row = db.prepare(`SELECT COALESCE(SUM(amount),0) AS balance,
        COALESCE(SUM(CASE WHEN day=? AND (kind IN ('earn','edit') OR
          (kind='reverse' AND reference IN (SELECT id FROM personal_entries WHERE kind='earn'))) THEN amount ELSE 0 END),0) AS earned
        FROM personal_entries`).get(day)!;
      return { balance: Number(row.balance), earned: Number(row.earned) };
    },
    minutes(subject: string) {
      return Number(db.prepare(`SELECT COALESCE(SUM(minutes),0) AS total FROM personal_entries
        WHERE subject=? AND kind IN ('earn','edit','reverse')`).get(subject)?.total);
    },
    progress() {
      return Object.fromEntries(db.prepare(`SELECT subject,SUM(minutes) AS minutes FROM personal_entries
        WHERE kind IN ('earn','edit','reverse') AND minutes<>0 GROUP BY subject HAVING SUM(minutes)>0`).all()
        .map(row => [String(row.subject), Number(row.minutes)]));
    },
    preferences() {
      return db.prepare("SELECT value FROM personal_preferences WHERE key='settings'").get()?.value;
    },
    savePreferences(json: string) {
      db.prepare("INSERT INTO personal_preferences VALUES ('settings',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(json);
    },
  };
}

export type PersonalRepository = ReturnType<typeof createPersonalRepository>;
