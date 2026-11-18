import { randomUUID } from 'node:crypto';
import { editSchedule } from './edit-schedule.ts';
import { addDays, localDay, validDate } from '../shared/calendar.ts';
import { occurrenceEnd } from '../shared/weekdays.ts';
import { PLAN_LIMITS, personalDefaults } from '../shared/personal.ts';
import type { ActivityEntry, HabitPlan, PersonalPreferences, PersonalView } from '../shared/personal.ts';
import type { PersonalRepository } from './personal-repository.ts';
import type { TaskRepository } from './repository.ts';
import type { TaskTransaction } from './service.ts';
import { TaskInputError } from './validation.ts';

function fields(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TaskInputError('Enter valid activity details.');
  return value as Record<string, unknown>;
}
function string(value: unknown, limit: number, label: string) {
  if (typeof value !== 'string' || value.trim().length > limit) throw new TaskInputError(label);
  return value.trim();
}
function integer(value: unknown, min: number, max: number, label: string) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) throw new TaskInputError(label);
  return value;
}
function operationId(value: unknown) {
  if (typeof value !== 'string' || !/^[a-f0-9-]{36}$/i.test(value)) throw new TaskInputError('Open the action again.');
  return value;
}
const planLabels: Record<keyof HabitPlan, string> = {
  cue: 'Keep the cue within 180 characters.', identity: 'Keep the identity within 120 characters.',
  time: 'Choose a valid time.', place: 'Keep the place within 80 characters.',
  starter: 'Keep the two-minute version within 180 characters.', bundle: 'Keep the pairing within 180 characters.',
};
// Every plan field is optional text. A time uses the 24-hour HH:MM form.
function planInput(value: Record<string, unknown>): HabitPlan {
  const plan = {} as HabitPlan;
  for (const key of Object.keys(PLAN_LIMITS) as (keyof HabitPlan)[]) {
    plan[key] = value[key] === undefined ? '' : string(value[key], PLAN_LIMITS[key], planLabels[key]);
  }
  if (plan.time && !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(plan.time)) throw new TaskInputError(planLabels.time);
  return plan;
}

export function createPersonalService(repository: PersonalRepository, tasks: TaskRepository, transaction: TaskTransaction) {
  const taskRule = (task: { id: string; recurrenceId: string | null }) => repository.rule(task.recurrenceId ?? task.id);
  const preferences = (): PersonalPreferences => {
    const stored = repository.preferences();
    return typeof stored === 'string' ? { ...personalDefaults, ...JSON.parse(stored) } : { ...personalDefaults };
  };
  const view = (now: Date): PersonalView => {
    const day = localDay(now);
    const days = Array.from({ length: 7 }, (_, i) => addDays(day, i - 6));
    return { day, week: { days, minutes: repository.week(days[0]!, day), points: repository.weekPoints(days[0]!, day) },
      recent: repository.recent(addDays(day, -14), addDays(day, -1)), votes: repository.votes(),
      ...repository.totals(day), rules: repository.rules(), identities: repository.identities(), entries: repository.entries(),
      rewards: repository.rewards().filter(item => !item.archived), preferences: preferences(), progress: repository.progress() };
  };
  function record(now: Date, entry: Omit<ActivityEntry, 'day' | 'loggedAt'>, day = localDay(now)) {
    repository.insert({ ...entry, day, loggedAt: now.toISOString() }, now);
  }
  function complete(task: NonNullable<ReturnType<TaskRepository['findTask']>>, now: Date) {
    const rule = taskRule(task);
    if (rule?.mode === 'minutes') throw new TaskInputError('Use Log minutes to record this activity.');
    if (rule && rule.rate > 0) record(now, { id: randomUUID(), kind: 'earn', subject: task.id, title: task.title,
      minutes: 0, rate: rule.rate, amount: rule.rate, reference: null });
  }
  function correctionSubject(entry: ActivityEntry, newDay: string) {
    const original = tasks.findTask(entry.subject);
    const recurrence = original?.recurrenceId && tasks.findRule(original.recurrenceId);
    const target = recurrence && tasks.occurrenceAt(recurrence.id, newDay);
    if (!target || target.status === 'cancelled' || !recurrence) {
      throw new TaskInputError('Choose a date when this habit was scheduled.');
    }
    if ((taskRule(target)?.unit ?? 'minutes') !== (entry.unit ?? 'minutes')) throw new TaskInputError('Choose a date with the same recording unit.');
    const end = occurrenceEnd(target, recurrence);
    if (end !== null && newDay >= end) throw new TaskInputError('Choose a date when this habit was scheduled.');
    return target.id;
  }
  function adjustHistory(id: string) {
    const task = tasks.findTask(id), rule = task && taskRule(task);
    if (rule?.mode === 'minutes') tasks.adjustDurationHistory(id, repository.minutes(id) >= rule.target);
  }
  function mutate(action: string, input: unknown) {
    return transaction(now => {
      const value = fields(input), day = localDay(now);
      let award = 0;
      if (action === 'remove') {
        const id = operationId(value.subject);
        if (value.scope === 'occurrence') {
          const task = tasks.findTask(id);
          if (task) tasks.removeOccurrence(task.id);
        } else if (value.scope === 'plan') {
          const rule = tasks.findRule(id);
          if (rule) tasks.removePlan(id, now.toISOString());
        } else throw new TaskInputError('Choose what to delete.');
      } else if (action === 'rule') {
        const id = operationId(value.subject), task = tasks.findTask(id), recurrence = tasks.findRule(id);
        if (!task && !recurrence) throw new TaskInputError('Choose an existing task or habit.');
        const subject = task?.recurrenceId ?? id;
        const mode = value.mode;
        const unit = value.unit ?? 'minutes';
        if (unit !== 'minutes' && unit !== 'count') throw new TaskInputError('Choose counts or minutes.');
        if (mode !== 'minutes' && mode !== 'complete') throw new TaskInputError('Choose how to record this activity.');
        if (mode === 'minutes' && !recurrence && !task?.recurrenceId) throw new TaskInputError('Set a repeating schedule for a duration habit.');
        const schedule = recurrence ?? (task?.recurrenceId ? tasks.findRule(task.recurrenceId) : undefined);
        const category = value.category ?? (mode === 'minutes' ? 'habit' : schedule?.category ?? 'task');
        if (category !== 'task' && category !== 'habit' || category === 'habit' && !schedule) {
          throw new TaskInputError('Choose a valid activity category.');
        }
        if (schedule) tasks.setCategory(subject, category);
        const previous = repository.rule(subject);
        if (previous && (previous.mode !== mode || (previous.unit ?? 'minutes') !== unit) && ((task && repository.hasActivity(task.id))
          || tasks.listPendingOccurrences().some(item => item.recurrenceId === subject && repository.hasActivity(item.id)))) {
          throw new TaskInputError('Wait for the next scheduled occurrence before changing how this habit is logged.');
        }
        if (value.schedule !== undefined) {
          if (!schedule) throw new TaskInputError('Open an active plan to change its schedule.');
          editSchedule(tasks, schedule, value.schedule, now);
        }
        repository.saveRule({ subject, mode, unit, rate: integer(value.rate, 0, 100000, 'Enter a valid point value.'),
          target: mode === 'minutes' ? integer(value.target, 1, 1440, 'Enter a target from 1 to 1440.') : 0,
          ...planInput(value) });
      } else if (action === 'reward') {
        const id = operationId(value.id), previous = repository.reward(id);
        const title = string(value.title, 160, 'Keep the reward name within 160 characters.');
        if (!title) throw new TaskInputError('Name the reward.');
        repository.saveReward({ id, title, cost: integer(value.cost, 1, 100000000, 'Enter a positive price.'),
          note: string(value.note, 500, 'Keep the note within 500 characters.'), onceOnly: value.onceOnly === true,
          archived: value.archived === true && !!previous });
      } else if (action === 'pin') {
        // An empty value unpins. Only a reward still in the shop can be pinned.
        const pinned = string(value.pinnedReward, 36, 'Choose a reward.');
        const reward = pinned ? repository.reward(pinned) : undefined;
        if (pinned && (!reward || reward.archived)) throw new TaskInputError('This reward is unavailable.');
        repository.savePreferences(JSON.stringify({ ...preferences(), pinnedReward: pinned }));
      } else if (action === 'preferences') {
        if (typeof value.volume !== 'number' || !Number.isFinite(value.volume) || value.volume < 0 || value.volume > 1) {
          throw new TaskInputError('Choose a volume between zero and full.');
        }
        repository.savePreferences(JSON.stringify({ sound: value.sound === true, volume: value.volume,
          reducedMotion: value.reducedMotion === true, pinnedReward: string(value.pinnedReward, 36, 'Choose a reward.') }));
      } else {
        const id = operationId(value.id);
        if (repository.entry(id)) return { view: view(now), award };
        if (action === 'log') {
          if (value.day !== day) throw new TaskInputError('The local date changed. Reopen this activity before saving.');
          const task = tasks.findTask(operationId(value.subject));
          const rule = task && taskRule(task);
          if (!task || task.status !== 'pending' || task.plannedDate > day || rule?.mode !== 'minutes') {
            throw new TaskInputError('This habit is no longer available today.');
          }
          if ((value.unit ?? 'minutes') !== (rule.unit ?? 'minutes')) throw new TaskInputError('The recording unit changed. Reopen this activity.');
          const minutes = integer(value.minutes, 1, 1440, 'Enter a whole amount from 1 to 1440.');
          award = minutes * rule.rate;
          record(now, { id, kind: 'earn', subject: task.id, title: task.title, minutes,
            rate: rule.rate, unit: rule.unit ?? 'minutes', amount: award, reference: null });
        } else if (action === 'redeem') {
          const reward = repository.reward(operationId(value.subject));
          if (!reward || reward.archived || (reward.onceOnly && reward.used)) throw new TaskInputError('This reward is unavailable.');
          if (value.cost !== reward.cost) throw new TaskInputError('The price changed. Refresh this reward first.');
          const balance = repository.totals(day).balance;
          if (balance < reward.cost) throw new TaskInputError('You need ' + ((reward.cost - balance) / 100) + ' more points.');
          record(now, { id, kind: 'redeem', subject: reward.id, title: reward.title, minutes: 0,
            rate: reward.cost, amount: -reward.cost, reference: null });
        } else if (action === 'reverse' || action === 'edit') {
          const entry = repository.entry(operationId(value.subject));
          if (!entry || (entry.kind !== 'earn' && entry.kind !== 'redeem')) throw new TaskInputError('Choose an activity or redemption.');
          const adjustments = repository.adjustments(entry.id);
          if (adjustments.some(item => item.kind === 'reverse')) throw new TaskInputError('This entry was already undone.');
          const currentMinutes = entry.minutes + adjustments.reduce((sum, item) => sum + item.minutes, 0);
          const currentAmount = entry.amount + adjustments.reduce((sum, item) => sum + item.amount, 0);
          if (action === 'edit' && entry.minutes <= 0) throw new TaskInputError('Choose a duration entry to edit.');
          const minutes = action === 'edit' ? integer(value.minutes, 1, 1440, 'Enter whole minutes from 1 to 1440.') : 0;
          const requestedDay = value.day ?? entry.day;
          if (action === 'edit' && (!validDate(requestedDay) || requestedDay > day)) {
            throw new TaskInputError('Choose today or an earlier activity date.');
          }
          const newDay = action === 'edit' && validDate(requestedDay) ? requestedDay : entry.day;
          const subject = newDay === entry.day ? entry.subject : correctionSubject(entry, newDay);
          record(now, { id, kind: action, subject: entry.subject, title: entry.title, rate: entry.rate, unit: entry.unit ?? 'minutes', reference: entry.id,
            minutes: minutes - currentMinutes, amount: (action === 'edit' ? minutes * entry.rate : 0) - currentAmount }, entry.day);
          if (newDay !== entry.day) repository.moveActivity(entry, newDay, subject, id);
          if (entry.kind === 'earn' && entry.minutes > 0) {
            adjustHistory(entry.subject);
            if (subject !== entry.subject) adjustHistory(subject);
          }
          if (action === 'reverse' && entry.kind === 'earn' && entry.minutes === 0) {
            const task = tasks.findTask(entry.subject);
            if (task && (!task.recurrenceId || (task.plannedDate === day && tasks.findRule(task.recurrenceId)))) tasks.reopenTask(task.id);
          }
        } else throw new TaskInputError('Unknown Personal action.');
      }
      return { view: view(now), award };
    });
  }
  // Reopening a completed task returns its active completion credit, the same as Undo in Points history.
  function reopen(task: { id: string }, now: Date) {
    const credit = repository.activeCompletion(task.id);
    if (credit) record(now, { id: randomUUID(), kind: 'reverse', subject: credit.subject, title: credit.title,
      minutes: 0, rate: credit.rate, amount: -credit.amount, reference: credit.id }, credit.day);
  }
  return { preferences, view: () => transaction(view), mutate, complete, reopen,
    // Runs inside the task transaction, so an invalid plan also discards the new task.
    createRule(subject: string, repeating: boolean, input: unknown) {
      const value = fields(input);
      const mode = value.mode ?? (value.habit === true ? 'minutes' : 'complete');
      if (mode !== 'minutes' && mode !== 'complete' || mode === 'minutes' && !repeating) {
        throw new TaskInputError('Choose a valid recording method.');
      }
      if (!repeating && value.category !== undefined && value.category !== 'task') throw new TaskInputError('Habits need a repeating schedule.');
      const unit = value.unit ?? 'minutes';
      if (unit !== 'minutes' && unit !== 'count') throw new TaskInputError('Choose counts or minutes.');
      const timed = mode === 'minutes';
      const plan = value.plan === undefined ? {} : fields(value.plan);
      repository.saveRule({ subject, mode, unit,
        rate: plan.rate === undefined ? (timed ? 100 : 500) : integer(plan.rate, 0, 100000, 'Enter a valid point value.'),
        target: !timed ? 0 : plan.target === undefined ? 5 : integer(plan.target, 1, 1440, 'Enter a target from 1 to 1440.'),
        ...planInput(plan) });
    },
    reachedTarget(task: NonNullable<ReturnType<TaskRepository['findTask']>>) {
      const rule = taskRule(task);
      return rule?.mode === 'minutes' && repository.minutes(task.id) >= rule.target;
    },
  };
}
