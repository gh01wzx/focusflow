import { randomUUID } from 'node:crypto';
import { localDay } from '../shared/calendar.ts';
import { personalDefaults } from '../shared/personal.ts';
import type { ActivityEntry, PersonalPreferences, PersonalView } from '../shared/personal.ts';
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

export function createPersonalService(repository: PersonalRepository, tasks: TaskRepository, transaction: TaskTransaction) {
  const taskRule = (task: { id: string; recurrenceId: string | null }) => repository.rule(task.recurrenceId ?? task.id);
  const preferences = (): PersonalPreferences => {
    const stored = repository.preferences();
    return typeof stored === 'string' ? { ...personalDefaults, ...JSON.parse(stored) } : { ...personalDefaults };
  };
  const view = (now: Date): PersonalView => {
    const day = localDay(now);
    return { day, ...repository.totals(day), rules: repository.rules(), entries: repository.entries(),
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
  function mutate(action: string, input: unknown) {
    return transaction(now => {
      const value = fields(input), day = localDay(now);
      let award = 0;
      if (action === 'rule') {
        const id = operationId(value.subject), task = tasks.findTask(id), recurrence = tasks.findRule(id);
        if (!task && !recurrence) throw new TaskInputError('Choose an existing task or habit.');
        const subject = task?.recurrenceId ?? id;
        const mode = value.mode;
        if (mode !== 'minutes' && mode !== 'complete') throw new TaskInputError('Choose how to record this activity.');
        if (mode === 'minutes' && !recurrence && !task?.recurrenceId) throw new TaskInputError('Set a repeating schedule for a duration habit.');
        const previous = repository.rule(subject);
        if (previous && previous.mode !== mode && ((task && repository.minutes(task.id) > 0)
          || tasks.listPendingOccurrences().some(item => item.recurrenceId === subject && repository.minutes(item.id) > 0))) {
          throw new TaskInputError('Wait for the next scheduled occurrence before changing how this habit is logged.');
        }
        repository.saveRule({ subject, mode, rate: integer(value.rate, 0, 100000, 'Enter a valid point value.'),
          target: mode === 'minutes' ? integer(value.target, 1, 1440, 'Enter a target between 1 and 1440 minutes.') : 0,
          cue: string(value.cue, 180, 'Keep the cue within 180 characters.') });
      } else if (action === 'reward') {
        const id = operationId(value.id), previous = repository.reward(id);
        const title = string(value.title, 160, 'Keep the reward name within 160 characters.');
        if (!title) throw new TaskInputError('Name the reward.');
        repository.saveReward({ id, title, cost: integer(value.cost, 1, 100000000, 'Enter a positive price.'),
          note: string(value.note, 500, 'Keep the note within 500 characters.'), onceOnly: value.onceOnly === true,
          archived: value.archived === true && !!previous });
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
          const minutes = integer(value.minutes, 1, 1440, 'Enter whole minutes from 1 to 1440.');
          award = minutes * rule.rate;
          record(now, { id, kind: 'earn', subject: task.id, title: task.title, minutes,
            rate: rule.rate, amount: award, reference: null });
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
          record(now, { id, kind: action, subject: entry.subject, title: entry.title, rate: entry.rate, reference: entry.id,
            minutes: minutes - currentMinutes, amount: (action === 'edit' ? minutes * entry.rate : 0) - currentAmount }, entry.day);
          if (action === 'reverse' && entry.kind === 'earn' && entry.minutes === 0) {
            const task = tasks.findTask(entry.subject);
            if (task && (!task.recurrenceId || task.plannedDate === day)) tasks.reopenTask(task.id);
          }
        } else throw new TaskInputError('Unknown Personal action.');
      }
      return { view: view(now), award };
    });
  }
  return { view: () => transaction(view), mutate, complete,
    createRule(subject: string, repeating: boolean, input: unknown) {
      const habit = repeating && fields(input).habit === true;
      repository.saveRule({ subject, mode: habit ? 'minutes' : 'complete', rate: habit ? 100 : 500,
        target: habit ? 5 : 0, cue: '' });
    },
    reachedTarget(task: NonNullable<ReturnType<TaskRepository['findTask']>>) {
      const rule = taskRule(task);
      return rule?.mode === 'minutes' && repository.minutes(task.id) >= rule.target;
    },
  };
}
