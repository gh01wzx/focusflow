import { t } from '../../workspace/locale.ts';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { motion } from 'motion/react';
import { points } from '../../../src/shared/personal.ts';
import type { ScoringRule } from '../../../src/shared/personal.ts';
import type { Task } from '../../../src/shared/tasks.ts';
import { cueLine, identityKey } from '../../../src/shared/habits.ts';
import type { HabitInsight, Mark } from '../../../src/shared/habits.ts';
import type { PersonalController } from '../usePersonal.ts';
import { spring } from './Animated.tsx';
import { MoonIcon, PencilIcon } from './Icons.tsx';

const markText: Record<Mark, string> = { done: 'done', started: 'showed up', missed: 'missed', rest: 'rest day', open: 'not yet' };

// A habit tracker row. Consistency and the chain forgive one miss; two misses in a row end the chain.
export function HabitTrack({ insight }: { insight: HabitInsight }) {
  const { shown, total } = insight.consistency;
  return <div className="habit-track">
    <span className="dots" role="img" aria-label={t('Recent: ') + insight.marks.map(mark => markText[mark]).join(', ')}>
      {insight.marks.map((mark, index) => <i key={index} data-mark={mark} />)}
    </span>
    {total > 0 && <span className="consistency" title={t("Shown up among the latest scheduled days, not counting rest days")}>{shown}/{total}</span>}
    {insight.chain > 1 && <span className="streak" title={t("One miss is forgiven. Two misses in a row end the chain.")}>{t("Chain")} {insight.chain}</span>}
    {insight.missedLast && <span className="nudge">{t("Missed last time. Never miss twice; two minutes counts.")}</span>}
  </div>;
}

// "· 23 votes" after an identity: every day done or started so far, across habits with that identity.
export function VoteCount({ votes }: { votes: number }) {
  return votes > 0 ? <span className="votes">{' · ' + votes + (votes === 1 ? ' vote' : ' votes')}</span> : null;
}

export function HabitCard({ task, rule, insight, state, onEdit, onRest, onLogged }: {
  task: Task; rule: ScoringRule; insight: HabitInsight; state: PersonalController;
  // first: this log is the first today, so it also casts a vote.
  onEdit(task: Task): void; onRest(task: Task): void; onLogged(task: Task, minutes: number, first: boolean): void;
}) {
  const [draft, setDraft] = useState<{ id: string; day: string; minutes: string; unit: 'minutes' | 'count' }>();
  const total = state.data?.progress[task.id] ?? 0;
  const votes = rule.identity ? state.data?.votes[identityKey(rule.identity)] ?? 0 : 0;
  const counted = rule.unit === 'count';
  const habit = task.category !== 'task';
  const met = total >= rule.target;
  const cue = cueLine(rule);
  function open(minutes = counted ? 1 : rule.target) {
    if (state.data) setDraft({ id: crypto.randomUUID(), day: state.data.day, minutes: String(minutes), unit: rule.unit ?? 'minutes' });
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft) return;
    const minutes = Number(draft.minutes);
    const first = total === 0;
    if (await state.mutate('log', { ...draft, subject: task.id, minutes }, rule.target)) {
      setDraft(undefined);
      onLogged(task, minutes, first);
    }
  }
  return <article className={`habit-card ${met ? 'met' : ''} ${habit ? '' : 'task-counter'}`} aria-label={task.title}>
    <div className="habit-top">
      <div className="habit-heading">
        <strong className="task-title">{task.title}</strong>
        {rule.identity && <p className="identity"><span>{t("Vote for")} </span>{rule.identity}<VoteCount votes={votes} /></p>}
        {cue && <p className="cue">{cue}</p>}
      </div>
      <button className="icon-button" disabled={state.busy} aria-label={t("Edit plan for {0}", task.title)} title={t("Edit plan")}
        onClick={() => onEdit(task)}><PencilIcon /></button>
      {!total && <button className="icon-button" disabled={state.busy} aria-label={t(habit ? 'Rest today {0}' : 'Cancel {0}', task.title)} title={t(habit ? 'Rest today' : 'Cancel')}
        onClick={() => onRest(task)}><MoonIcon /></button>}
      <button className="primary" disabled={state.busy || !state.data || !!draft} onClick={() => open()}>
        {total ? t('Log again') : t(counted ? 'Log counts' : 'Log minutes')}</button>
    </div>
    <div className="habit-progress">
      <span className="meter" role="progressbar" aria-label={task.title + ' ' + t(counted ? 'Counts' : 'Minutes')}
        aria-valuemin={0} aria-valuemax={rule.target} aria-valuenow={Math.min(total, rule.target)}>
        <motion.span initial={false} animate={{ scaleX: Math.min(1, total / rule.target) }} transition={spring} />
      </span>
      <span className="habit-numbers">{[t(counted ? '{0} / {1} counts' : '{0} / {1} min', total, rule.target), met ? t('Target met') : total ? t('Showed up') : '',
        points(rule.rate) + t(counted ? ' pt/count' : ' pt/min')].filter(Boolean).join(' · ')}</span>
    </div>
    {habit && !met && rule.starter && <p className="starter">{t("Two-minute start:")} {rule.starter}
      <button type="button" className="chip" disabled={state.busy || !state.data || !!draft} onClick={() => open(counted ? 1 : 2)}>{t(counted ? "Log 1 count" : "Log 2 min")}</button></p>}
    {rule.bundle && <p className="bundle">{t("Only while doing this:")} {rule.bundle}</p>}
    {habit && <HabitTrack insight={insight} />}
    {draft && <form className="inline-settings log-form" onSubmit={event => void save(event)}>
      <label>{t(counted ? "Counts" : "Minutes")} <input type="number" min="1" max="1440" step="1" value={draft.minutes} required autoFocus
        onChange={event => setDraft({ ...draft, minutes: event.target.value })} /></label>
      <div className="chip-row">
        {[1, 2, 5, 10].filter(value => value !== rule.target).concat(rule.target).sort((a, b) => a - b).map(value =>
          <button key={value} type="button" className={`chip ${draft.minutes === String(value) ? 'selected' : ''}`}
            onClick={() => setDraft({ ...draft, minutes: String(value) })}>{value} {t(counted ? "counts" : "min")}</button>)}
      </div>
      {draft.day !== state.data?.day && <p role="alert">{t("The date changed. Reopen this activity before saving.")}</p>}
      <button className="primary" disabled={state.busy || draft.day !== state.data?.day}>{t("Save")}</button>
      <button type="button" className="secondary-button" onClick={() => setDraft(undefined)}>{t("Cancel")}</button>
    </form>}
  </article>;
}
