import test from 'node:test';
import assert from 'node:assert/strict';
import { habitInsight, nextUp, outcomeOf, reviewHabits } from '../src/shared/habits.ts';
import { addDays } from '../src/shared/calendar.ts';
import type { Outcome, ScoringRule } from '../src/shared/personal.ts';
import type { RecurrenceRule, Task, TaskStatus } from '../src/shared/tasks.ts';

const occurrence = (day: string, status: TaskStatus, id = 'task-' + day): Task => ({
  id, title: 'Read', plannedDate: day, status, createdAt: day + 'T00:00:00Z',
  resolvedAt: status === 'pending' ? null : day + 'T23:00:00Z', recurrenceId: 'rule', frequency: 'daily',
});
const today = occurrence('2026-11-10', 'pending');
const open = { done: false, started: false };

test('one miss is forgiven and two misses in a row end the chain', () => {
  const history = [occurrence('2026-11-05', 'completed'), occurrence('2026-11-06', 'completed'),
    occurrence('2026-11-07', 'missed'), occurrence('2026-11-08', 'completed'), occurrence('2026-11-09', 'completed')];
  assert.equal(habitInsight(today, history, open).chain, 4);
  assert.equal(habitInsight(today, history, { done: true, started: true }).chain, 5);
  const twice = [occurrence('2026-11-05', 'completed'), occurrence('2026-11-06', 'missed'), occurrence('2026-11-07', 'missed'),
    occurrence('2026-11-08', 'completed'), occurrence('2026-11-09', 'completed')];
  assert.equal(habitInsight(today, twice, open).chain, 2);
});

test('rest days are neutral and logged minutes on a missed day count as showing up', () => {
  const history = [occurrence('2026-11-06', 'completed'), occurrence('2026-11-07', 'cancelled'),
    occurrence('2026-11-08', 'missed'), occurrence('2026-11-09', 'missed')];
  const insight = habitInsight(today, history, open, day => day === '2026-11-08');
  assert.deepEqual(insight.marks, ['done', 'rest', 'started', 'missed', 'open']);
  assert.equal(insight.chain, 2);
  assert.deepEqual(insight.consistency, { shown: 2, total: 3 });
  assert.equal(insight.missedLast, true);
  assert.equal(habitInsight(today, history, { done: false, started: true }).missedLast, false);
});

test('Next puts arrived planned times first, then untimed habits and tasks, then later times', () => {
  const rule = (subject: string, time: string, mode: ScoringRule['mode'] = 'complete', target = 0): ScoringRule =>
    ({ subject, mode, rate: 100, target, time, cue: '', identity: '', place: '', starter: '', bundle: '' });
  const habit = (id: string, recurrenceId: string): Task => ({ ...occurrence('2026-11-10', 'pending', id), recurrenceId });
  const task = (id: string): Task => ({ ...occurrence('2026-11-10', 'pending', id), recurrenceId: null, frequency: null });
  const rules = new Map<string, ScoringRule>([['late', rule('late', '18:00')], ['early', rule('early', '07:30')],
    ['timed', rule('timed', '', 'minutes', 5)]]);
  const due = [task('plain-task'), habit('late-habit', 'late'), habit('untimed-habit', 'untimed'),
    habit('early-habit', 'early'), habit('timed-habit', 'timed')];
  assert.deepEqual(nextUp(due, rules, {}, '09:00').map(item => item.id),
    ['early-habit', 'untimed-habit', 'timed-habit', 'plain-task', 'late-habit']);
  assert.equal(nextUp(due, rules, { 'timed-habit': 5 }, '09:00').some(item => item.id === 'timed-habit'), false);
  assert.equal(nextUp(due, rules, { 'timed-habit': 2 }, '09:00').at(-1)?.id, 'timed-habit');
  assert.deepEqual(nextUp(due, rules, {}, '09:00', ['plain-task']).slice(0, 2).map(item => item.id), ['early-habit', 'plain-task']);
});

test('an occurrence outcome counts logged minutes on a missed day as showing up', () => {
  assert.equal(outcomeOf('completed', 0), 'done');
  assert.equal(outcomeOf('missed', 3), 'started');
  assert.equal(outcomeOf('missed', 0), 'missed');
  assert.equal(outcomeOf('cancelled', 0), 'rest');
  assert.equal(outcomeOf('pending', 5), null);
});

test('the weekly review suggests one next step from the last two weeks', () => {
  const today = '2026-11-16';
  const schedule = (id: string, startDate: string): RecurrenceRule => ({ id, title: 'Habit ' + id, frequency: 'daily', weekdays: null,
    startDate, nextDate: '2026-11-17', createdAt: startDate + 'T00:00:00Z', stoppedAt: null });
  const plan = (subject: string, mode: ScoringRule['mode'], target = 0): ScoringRule =>
    ({ subject, mode, rate: 100, target, time: '', cue: '', identity: '', place: '', starter: '', bundle: '' });
  // Outcomes from November 2, oldest first: the week before, then the last seven days.
  const days = (...outcomes: Outcome[]) => Object.fromEntries(outcomes.map((outcome, index) => [addDays('2026-11-02', index), outcome]));
  const all = (outcome: Outcome) => days(...Array<Outcome>(14).fill(outcome));
  const rules = new Map<string, ScoringRule>([['reader', plan('reader', 'minutes', 20)], ['walker', plan('walker', 'complete')],
    ['old', plan('old', 'complete')], ['hard', plan('hard', 'minutes', 10)], ['fresh', plan('fresh', 'complete')],
    ['keeper', plan('keeper', 'complete')]]);
  const recent = {
    reader: all('done'),
    walker: days(...Array<Outcome>(13).fill('done'), 'rest'),
    old: all('done'),
    hard: days(...Array<Outcome>(7).fill('done'), 'missed', 'missed', 'started', 'missed', 'done', 'missed', 'missed'),
    fresh: { '2026-11-12': 'done', '2026-11-13': 'done' } as Record<string, Outcome>,
    keeper: days('done', 'done', 'done', 'missed', 'done', 'done', 'done', 'done', 'missed', 'done', 'missed', 'done', 'done', 'done'),
  };
  const schedules = [schedule('reader', '2026-10-01'), schedule('walker', '2026-10-01'), schedule('old', '2026-08-01'),
    schedule('hard', '2026-10-01'), schedule('fresh', '2026-11-12'), schedule('keeper', '2026-10-01')];
  const reviews = reviewHabits(today, schedules, rules, recent);
  assert.deepEqual(reviews.map(review => review.suggestion), [{ kind: 'grow', target: 30 }, { kind: 'steady' },
    { kind: 'graduate', days: 107 }, { kind: 'ease', target: 5 }, { kind: 'new' }, { kind: 'keep' }]);
  assert.deepEqual([reviews[3]!.week, reviews[3]!.before], [{ done: 2, total: 7 }, { done: 7, total: 7 }]);
  assert.deepEqual(reviews[1]!.week, { done: 6, total: 6 });
  // With fewer than three habits, a steady checked-off habit suggests stacking a new one after it.
  assert.deepEqual(reviewHabits(today, [schedule('walker', '2026-10-01')], rules, recent)[0]!.suggestion, { kind: 'stack' });
  // Showing up steadily without meeting the target keeps the target as it is.
  assert.deepEqual(reviewHabits(today, [schedule('reader', '2026-10-01')], rules, { reader: all('started') })[0]!.suggestion,
    { kind: 'steady' });
  assert.equal(reviewHabits(today, [schedule('later', '2026-11-20')], rules, {}).length, 0);
});
