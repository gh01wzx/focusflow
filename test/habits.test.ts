import test from 'node:test';
import assert from 'node:assert/strict';
import { habitInsight, nextUp } from '../src/shared/habits.ts';
import type { ScoringRule } from '../src/shared/personal.ts';
import type { Task, TaskStatus } from '../src/shared/tasks.ts';

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
