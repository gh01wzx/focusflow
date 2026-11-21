import { t } from '../../workspace/locale.ts';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { motion } from 'motion/react';
import { points } from '../../../src/shared/personal.ts';
import type { ScoringRule } from '../../../src/shared/personal.ts';
import type { Task } from '../../../src/shared/tasks.ts';
import { cueLine, identityKey, nextTier, tierLevel, tiersOf } from '../../../src/shared/habits.ts';
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

export function HabitCard({ task, rule, insight, state, logged, week, onEdit, onRest, onLogged }: {
  task: Task; rule: ScoringRule; insight: HabitInsight; state: PersonalController;
  // The amount toward today's tiers; a flexible weekly habit also shows its days this week.
  logged: number; week?: { done: number; times: number } | undefined;
  // first: this log is the first today, so it also casts a vote.
  onEdit(task: Task): void; onRest(task: Task): void; onLogged(task: Task, minutes: number, first: boolean): void;
}) {
  const [draft, setDraft] = useState<{ id: string; day: string; minutes: string; unit: 'minutes' | 'count' }>();
  const total = logged;
  const votes = rule.identity ? state.data?.votes[identityKey(rule.identity)] ?? 0 : 0;
  const counted = rule.unit === 'count';
  const habit = task.category !== 'task';
  const met = total >= rule.target;
  const cue = cueLine(rule);
  const amount = (value: number) => t(counted ? '{0} counts' : '{0} min', value);
  // A habit climbs check-in, maintain and goal; a counted task works toward its target alone.
  const tiers = tiersOf(rule);
  const level = habit ? tierLevel(total, tiers) : met ? 3 : 0;
  const next = habit ? nextTier(total, tiers) : met ? null : { level: 3 as const, amount: rule.target, remaining: rule.target - total };
  const status = level === 3 ? t('Target met') : level === 2 ? t('Maintained') : level === 1 ? t('Checked in') : total ? t('Showed up') : '';
  function open(minutes = next?.remaining ?? (counted ? 1 : tiers.start)) {
    if (state.data) setDraft({ id: crypto.randomUUID(), day: state.data.day, minutes: String(minutes), unit: rule.unit ?? 'minutes' });
  }
  async function log(minutes: number) {
    if (!state.data) return false;
    const first = total === 0;
    const saved = await state.mutate('log', { id: draft?.id ?? crypto.randomUUID(), day: draft?.day ?? state.data.day,
      unit: rule.unit ?? 'minutes', subject: task.id, minutes }, rule.target);
    if (saved) onLogged(task, minutes, first);
    return saved;
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (draft && await log(Number(draft.minutes))) setDraft(undefined);
  }
  // One tap records the rest of the next tier, so starting is a single step.
  const step = habit && next ? next : null;
  const stepLabel = !step ? '' : step.level === 1 ? t('Check in · {0}', amount(step.remaining))
    : step.level === 2 ? t('Maintain · {0} more', amount(step.remaining)) : t('Goal · {0} more', amount(step.remaining));
  const chips = [...new Set([1, 2, 5, 10, tiers.start, tiers.maintain, rule.target])].sort((a, b) => a - b);
  return <article className={`habit-card ${met ? 'met' : ''} ${habit ? '' : 'task-counter'}`} aria-label={task.title}>
    <div className="habit-top">
      <div className="habit-heading">
        <strong className="task-title">{task.title}</strong>
        {rule.identity && <p className="identity"><span>{t("Vote for")} </span>{rule.identity}<VoteCount votes={votes} /></p>}
        {cue && <p className="cue">{cue}</p>}
      </div>
      <button className="icon-button" disabled={state.busy} aria-label={t("Edit plan for {0}", task.title)} title={t("Edit plan")}
        onClick={() => onEdit(task)}><PencilIcon /></button>
      {!total && !week && <button className="icon-button" disabled={state.busy} aria-label={t(habit ? 'Rest today {0}' : 'Cancel {0}', task.title)} title={t(habit ? 'Rest today' : 'Cancel')}
        onClick={() => onRest(task)}><MoonIcon /></button>}
      {step ? <button className="primary" disabled={state.busy || !state.data || !!draft} onClick={() => void log(step.remaining)}>{stepLabel}</button>
        : <button className="primary" disabled={state.busy || !state.data || !!draft} onClick={() => open()}>
          {total ? t('Log again') : t(counted ? 'Log counts' : 'Log minutes')}</button>}
    </div>
    <div className="habit-progress">
      <span className={`meter ${habit ? 'tiered' : ''}`} role="progressbar" aria-label={task.title + ' ' + t(counted ? 'Counts' : 'Minutes')}
        aria-valuemin={0} aria-valuemax={rule.target} aria-valuenow={Math.min(total, rule.target)}>
        <motion.span initial={false} animate={{ scaleX: Math.min(1, total / rule.target) }} transition={spring} />
        {habit && [tiers.start, tiers.maintain].filter(value => value < tiers.goal).map(value =>
          <i key={value} className="tier-mark" style={{ left: `${value / tiers.goal * 100}%` }} />)}
      </span>
      <span className="habit-numbers">{[t(counted ? '{0} / {1} counts' : '{0} / {1} min', total, rule.target), status,
        points(rule.rate) + t(counted ? ' pt/count' : ' pt/min')].filter(Boolean).join(' · ')}</span>
    </div>
    {week && <p className="week-line"><span className="consistency">{t("{0} of {1} days this week", Math.min(week.done, week.times), week.times)}</span>
      {week.done >= week.times ? t("This week is done. Extra days still earn points.") : t("Any day counts once it is checked in.")}</p>}
    {habit && <p className="tier-line">
      {level === 0 && rule.starter ? <>{t("Two-minute start:")} {rule.starter}</>
        : t('Check in {0} · Maintain {1} · Goal {2}', amount(tiers.start), amount(tiers.maintain), amount(tiers.goal))}
      {!draft && <button type="button" className="text-button" disabled={state.busy || !state.data} onClick={() => open()}>{t("Other amount")}</button>}
    </p>}
    {rule.bundle && <p className="bundle">{t("Only while doing this:")} {rule.bundle}</p>}
    {habit && <HabitTrack insight={insight} />}
    {/* A custom amount. The buttons keep one place at the end of the panel; Enter saves and Esc closes. */}
    {draft && <form className="log-panel" onSubmit={event => void save(event)}
      onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); setDraft(undefined); } }}>
      <div className="log-fields">
        <label>{t(counted ? "Counts" : "Minutes")} <input type="number" min="1" max="1440" step="1" value={draft.minutes} required autoFocus
          onChange={event => setDraft({ ...draft, minutes: event.target.value })} /></label>
        <div className="chip-row">{chips.map(value =>
          <button key={value} type="button" className={`chip ${draft.minutes === String(value) ? 'selected' : ''}`}
            onClick={() => setDraft({ ...draft, minutes: String(value) })}>{value} {t(counted ? "counts" : "min")}</button>)}
        </div>
      </div>
      {draft.day !== state.data?.day && <p role="alert">{t("The date changed. Reopen this activity before saving.")}</p>}
      <div className="log-actions">
        <button type="button" className="secondary-button" onClick={() => setDraft(undefined)}>{t("Cancel")}</button>
        <button className="primary" disabled={state.busy || draft.day !== state.data?.day}>{t("Save")}</button>
      </div>
    </form>}
  </article>;
}
