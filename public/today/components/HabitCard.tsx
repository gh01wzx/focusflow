import { t } from '../../workspace/locale.ts';
import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { points } from '../../../src/shared/personal.ts';
import type { ScoringRule } from '../../../src/shared/personal.ts';
import type { Task } from '../../../src/shared/tasks.ts';
import { identityKey, nextTier, tierLevel, tiersOf } from '../../../src/shared/habits.ts';
import type { HabitInsight, Mark, TierLevel } from '../../../src/shared/habits.ts';
import type { PersonalController } from '../usePersonal.ts';
import { afterCue, cueText } from '../view-options.ts';
import { spring } from './Animated.tsx';
import { CheckIcon, MoonIcon, PencilIcon } from './Icons.tsx';

const markText: Record<Mark, string> = { done: 'done', started: 'showed up', missed: 'missed', rest: 'rest day', open: 'not yet' };

// A habit tracker row. Consistency and the chain forgive one miss; two misses in a row end the chain.
export function HabitTrack({ insight, nudge = true }: { insight: HabitInsight; nudge?: boolean }) {
  const { shown, total } = insight.consistency;
  return <div className="habit-track">
    <span className="dots" role="img" aria-label={t('Recent: ') + insight.marks.map(mark => t(markText[mark])).join(', ')}>
      {insight.marks.map((mark, index) => <i key={index} data-mark={mark} />)}
    </span>
    {total > 0 && <span className="consistency" title={t("Shown up among the latest scheduled days, not counting rest days")}>{shown}/{total}</span>}
    {insight.chain > 1 && <span className="streak" title={t("One miss is forgiven. Two misses in a row end the chain.")}>{t("Chain")} {insight.chain}</span>}
    {nudge && insight.missedLast && <span className="nudge">{t("Missed last time. Never miss twice; two minutes counts.")}</span>}
  </div>;
}

// "· 23 votes" after an identity: every day done or started so far, across habits with that identity.
export function VoteCount({ votes }: { votes: number }) {
  return votes > 0 ? <span className="votes">{' · ' + t(votes === 1 ? '{0} vote' : '{0} votes', votes)}</span> : null;
}

// The short line shown when a step is finished, before the next step appears.
const cheers: Record<1 | 2 | 3, string> = { 1: 'Checked in. Showing up is what counts.', 2: 'Maintained. The habit stays alive.', 3: 'Goal reached. Well done.' };
const CHEER_MS = 1600;

// The current step as a ring: it fills toward this step only and closes with a check when the step is done.
function StepRing({ fill, label, done, title }: { fill: number; label: string; done: boolean; title: string }) {
  return <span className={`step-ring ${done ? 'done' : ''}`} role="img" aria-label={title}>
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <circle className="track" cx="24" cy="24" r="20" />
      <motion.circle className="fill" cx="24" cy="24" r="20" initial={false}
        animate={{ pathLength: done ? 1 : Math.max(0, Math.min(1, fill)) }} transition={spring} />
    </svg>
    <AnimatePresence initial={false} mode="popLayout">
      {done ? <motion.span key="check" className="ring-check" aria-hidden="true" initial={{ scale: 0 }} animate={{ scale: 1 }}
          exit={{ scale: 0 }} transition={{ type: 'spring', stiffness: 520, damping: 16 }}><CheckIcon /></motion.span>
        : <motion.span key="label" className="ring-label" aria-hidden="true" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>{label}</motion.span>}
    </AnimatePresence>
  </span>;
}

// A timed or counted habit shows one step at a time: the two-minute version, then maintain, then the
// goal. Each step closes its ring with a short note before the next one appears. A counted task has
// its target as its only step. Details stay folded under the habit until it is clicked.
export function HabitCard({ task, rule, insight, state, logged, week, onEdit, onRest, onLogged }: {
  task: Task; rule: ScoringRule; insight: HabitInsight; state: PersonalController;
  // The amount toward today's steps; a flexible weekly habit also shows its days this week.
  logged: number; week?: { done: number; times: number } | undefined;
  // first: this log is the first today, so it also casts a vote.
  onEdit(task: Task): void; onRest(task: Task): void; onLogged(task: Task, minutes: number, first: boolean): void;
}) {
  const [draft, setDraft] = useState<{ id: string; day: string; amount: string }>();
  const [details, setDetails] = useState(false);
  const total = logged;
  const votes = rule.identity ? state.data?.votes[identityKey(rule.identity)] ?? 0 : 0;
  const counted = rule.unit === 'count';
  const habit = task.category !== 'task';
  const amount = (value: number) => t(!counted ? '{0} min' : value === 1 ? '{0} count' : '{0} counts', value);
  const tiers = tiersOf(rule);
  const level: TierLevel = habit ? tierLevel(total, tiers) : total >= rule.target ? 3 : 0;
  const weekDone = !!week && week.done >= week.times;

  // A step finished by a log here gets its moment; opening the app or undoing never does.
  const [cheer, setCheer] = useState<1 | 2 | 3 | null>(null);
  const shownLevel = useRef(level);
  useEffect(() => {
    const before = shownLevel.current;
    shownLevel.current = level;
    if (level <= before) { setCheer(null); return; }
    setCheer(level as 1 | 2 | 3);
    const id = setTimeout(() => setCheer(null), CHEER_MS);
    return () => clearTimeout(id);
  }, [level]);

  const stepGoal = !habit ? rule.target : level === 0 ? tiers.start : level === 1 ? tiers.maintain : tiers.goal;
  const stepFrom = !habit || level === 0 ? 0 : level === 1 ? tiers.start : tiers.maintain;
  const finished = level === 3 || cheer !== null;
  const next = habit ? nextTier(total, tiers) : total < rule.target ? { remaining: rule.target - total } : null;
  const startLine = [rule.cue && afterCue(rule.cue), rule.starter || t('Start with {0}', amount(tiers.start))].filter(Boolean).join(' → ');
  // A flexible habit whose week is done shows the goal as met, so its note is about the week.
  const stepLine = cheer ? t(!habit ? 'Target reached.' : cheer === 3 && weekDone ? 'This week is done.' : cheers[cheer])
    : level === 3 ? (weekDone ? t("This week is done. Extra days still earn points.") : t('Done today · {0}', amount(total)))
    : !habit ? t('Goal: {0}', amount(rule.target))
    : level === 0 ? startLine : level === 1 ? t('Keep going to {0}', amount(tiers.maintain)) : t('Go for the goal: {0}', amount(tiers.goal));

  function open() {
    if (state.data) setDraft({ id: crypto.randomUUID(), day: state.data.day, amount: String(next?.remaining ?? (counted ? 1 : tiers.start)) });
  }
  async function log(value: number) {
    if (!state.data || !draft || !(value >= 1 && value <= 1440)) return;
    const first = total === 0;
    const saved = await state.mutate('log', { id: draft.id, day: draft.day, unit: rule.unit ?? 'minutes', subject: task.id, minutes: value }, rule.target);
    if (saved) { setDraft(undefined); onLogged(task, value, first); }
  }
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void log(Number(draft?.amount));
  }
  const quick = [...new Set([next?.remaining ?? 0, ...(counted ? [1, 5, 10] : [5, 10, 15])])].filter(value => value > 0);
  const badge = week ? <span className="consistency">{t("{0} of {1} days this week", Math.min(week.done, week.times), week.times)}</span>
    : habit && insight.missedLast && !total ? <span className="nudge">{t("Never miss twice")}</span>
    : habit && insight.chain > 1 ? <span className="streak">{t("Chain {0}", insight.chain)}</span> : null;
  const where = cueText(rule);
  const busy = state.busy || !state.data;

  return <article className={`habit-card ${level === 3 ? 'met' : ''} ${habit ? '' : 'task-counter'}`} aria-label={task.title}>
    <div className="habit-top">
      <StepRing fill={(total - stepFrom) / Math.max(1, stepGoal - stepFrom)} done={finished}
        label={total + '/' + stepGoal} title={t(counted ? '{0} / {1} counts' : '{0} / {1} min', total, stepGoal)} />
      <button type="button" className="habit-summary" aria-expanded={details} onClick={() => setDetails(!details)}>
        <span className="habit-title-row">
          <strong className="task-title">{task.title}</strong>
          {habit && <span className="step-pips" aria-hidden="true">{[0, 1, 2].map(index =>
            <i key={index} className={level > index || (cheer !== null && cheer > index) ? 'done' : level === index ? 'current' : ''} />)}</span>}
          {badge}
        </span>
        {rule.identity && <span className="identity">{rule.identity}</span>}
        <AnimatePresence initial={false} mode="wait">
          <motion.span key={cheer ? 'cheer' + cheer : 'step' + level} className={`step-line ${cheer ? 'cheer' : ''}`}
            initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.22 }}>
            {stepLine}</motion.span>
        </AnimatePresence>
      </button>
      <button className={level === 3 ? 'secondary-button' : 'primary'} disabled={busy || !!draft}
        aria-label={t("Record {0}", task.title)} onClick={open}>{t("Record")}</button>
    </div>
    {/* Quick amounts save at once; another amount saves with Enter, and Esc closes. */}
    {draft && <form className="log-panel" onSubmit={save}
      onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); setDraft(undefined); } }}>
      <div className="chip-row" role="group" aria-label={t("Record {0}", task.title)}>
        {quick.map((value, index) => <button key={value} type="button" className={`chip ${index === 0 && next ? 'selected' : ''}`}
          disabled={busy || draft.day !== state.data?.day} onClick={() => void log(value)}>+{amount(value)}</button>)}
      </div>
      <div className="log-fields">
        <label>{t("Other amount")} <input type="number" min="1" max="1440" step="1" value={draft.amount} required autoFocus
          onChange={event => setDraft({ ...draft, amount: event.target.value })} /></label>
        <div className="log-actions">
          <button type="button" className="secondary-button" onClick={() => setDraft(undefined)}>{t("Cancel")}</button>
          <button className="primary" disabled={busy || draft.day !== state.data?.day}>{t("Save")}</button>
        </div>
      </div>
      {draft.day !== state.data?.day && <p role="alert">{t("The date changed. Reopen this activity before saving.")}</p>}
    </form>}
    <AnimatePresence initial={false}>
      {details && <motion.div key="details" className="habit-details" initial={{ height: 0, opacity: 0 }}
        animate={{ height: 'auto', opacity: 1, transitionEnd: { height: 'auto' } }} exit={{ height: 0, opacity: 0 }}
        transition={{ duration: 0.24, ease: [0.32, 0.72, 0, 1] }}>
        {where && <p className="cue">{where}</p>}
        {rule.bundle && <p className="bundle">{t("Only while doing this:")} {rule.bundle}</p>}
        <p className="tier-line">{[habit ? t('Check in {0} · Maintain {1} · Goal {2}', amount(tiers.start), amount(tiers.maintain), amount(tiers.goal)) : '',
          points(rule.rate) + t(counted ? ' pt/count' : ' pt/min')].filter(Boolean).join(' · ')}<VoteCount votes={votes} /></p>
        {habit && <HabitTrack insight={insight} nudge={false} />}
        <div className="habit-detail-actions">
          <button type="button" className="text-button" disabled={state.busy} onClick={() => onEdit(task)}><PencilIcon />{t("Edit plan")}</button>
          {!total && !week && <button type="button" className="text-button" disabled={state.busy} onClick={() => onRest(task)}>
            <MoonIcon />{t(habit ? 'Rest today' : 'Cancel')}</button>}
        </div>
      </motion.div>}
    </AnimatePresence>
  </article>;
}
