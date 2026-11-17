import { useState } from 'react';
import type { FormEvent } from 'react';
import { motion } from 'motion/react';
import { points } from '../../../src/shared/personal.ts';
import type { ScoringRule } from '../../../src/shared/personal.ts';
import type { Task } from '../../../src/shared/tasks.ts';
import { cueLine } from '../../../src/shared/habits.ts';
import type { HabitInsight, Mark } from '../../../src/shared/habits.ts';
import type { PersonalController } from '../usePersonal.ts';
import { spring } from './Animated.tsx';
import { MoonIcon, PencilIcon } from './Icons.tsx';

const markText: Record<Mark, string> = { done: 'done', started: 'showed up', missed: 'missed', rest: 'rest day', open: 'not yet' };

// A habit tracker row. Consistency and the chain forgive one miss; two misses in a row end the chain.
export function HabitTrack({ insight }: { insight: HabitInsight }) {
  const { shown, total } = insight.consistency;
  return <div className="habit-track">
    <span className="dots" role="img" aria-label={'Recent: ' + insight.marks.map(mark => markText[mark]).join(', ')}>
      {insight.marks.map((mark, index) => <i key={index} data-mark={mark} />)}
    </span>
    {total > 0 && <span className="consistency" title="Shown up among the latest scheduled days, not counting rest days">{shown}/{total}</span>}
    {insight.chain > 1 && <span className="streak" title="One miss is forgiven. Two misses in a row end the chain.">Chain {insight.chain}</span>}
    {insight.missedLast && <span className="nudge">Missed last time. Never miss twice; two minutes counts.</span>}
  </div>;
}

export function HabitCard({ task, rule, insight, state, onEdit, onRest, onLogged }: {
  task: Task; rule: ScoringRule; insight: HabitInsight; state: PersonalController;
  onEdit(task: Task): void; onRest(task: Task): void; onLogged(task: Task, minutes: number): void;
}) {
  const [draft, setDraft] = useState<{ id: string; day: string; minutes: string }>();
  const total = state.data?.progress[task.id] ?? 0;
  const met = total >= rule.target;
  const cue = cueLine(rule);
  function open(minutes = rule.target) {
    if (state.data) setDraft({ id: crypto.randomUUID(), day: state.data.day, minutes: String(minutes) });
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft) return;
    const minutes = Number(draft.minutes);
    if (await state.mutate('log', { ...draft, subject: task.id, minutes }, rule.target)) {
      setDraft(undefined);
      onLogged(task, minutes);
    }
  }
  return <article className={`habit-card ${met ? 'met' : ''}`} aria-label={task.title}>
    <div className="habit-top">
      <div className="habit-heading">
        <strong className="task-title">{task.title}</strong>
        {rule.identity && <p className="identity"><span>Vote for </span>{rule.identity}</p>}
        {cue && <p className="cue">{cue}</p>}
      </div>
      <button className="icon-button" disabled={state.busy} aria-label={`Edit plan for ${task.title}`} title="Edit plan"
        onClick={() => onEdit(task)}><PencilIcon /></button>
      {!total && <button className="icon-button" disabled={state.busy} aria-label={`Rest today ${task.title}`} title="Rest today"
        onClick={() => onRest(task)}><MoonIcon /></button>}
      <button className="primary" disabled={state.busy || !state.data || !!draft} onClick={() => open()}>
        {total ? 'Log again' : 'Log minutes'}</button>
    </div>
    <div className="habit-progress">
      <span className="meter" role="progressbar" aria-label={task.title + ' minutes today'}
        aria-valuemin={0} aria-valuemax={rule.target} aria-valuenow={Math.min(total, rule.target)}>
        <motion.span initial={false} animate={{ scaleX: Math.min(1, total / rule.target) }} transition={spring} />
      </span>
      <span className="habit-numbers">{[`${total} / ${rule.target} min`, met ? 'Target met' : total ? 'Showed up' : '',
        points(rule.rate) + ' pt/min'].filter(Boolean).join(' · ')}</span>
    </div>
    {!met && rule.starter && <p className="starter">Two-minute start: {rule.starter}
      <button type="button" className="chip" disabled={state.busy || !state.data || !!draft} onClick={() => open(2)}>Log 2 min</button></p>}
    {rule.bundle && <p className="bundle">Only while doing this: {rule.bundle}</p>}
    <HabitTrack insight={insight} />
    {draft && <form className="inline-settings log-form" onSubmit={event => void save(event)}>
      <label>Minutes <input type="number" min="1" max="1440" step="1" value={draft.minutes} required autoFocus
        onChange={event => setDraft({ ...draft, minutes: event.target.value })} /></label>
      <div className="chip-row">
        {[1, 2, 5, 10].filter(value => value !== rule.target).concat(rule.target).sort((a, b) => a - b).map(value =>
          <button key={value} type="button" className={`chip ${draft.minutes === String(value) ? 'selected' : ''}`}
            onClick={() => setDraft({ ...draft, minutes: String(value) })}>{value} min</button>)}
      </div>
      {draft.day !== state.data?.day && <p role="alert">The date changed. Reopen this activity before saving.</p>}
      <button className="primary" disabled={state.busy || draft.day !== state.data?.day}>Save</button>
      <button type="button" className="secondary-button" onClick={() => setDraft(undefined)}>Cancel</button>
    </form>}
  </article>;
}
