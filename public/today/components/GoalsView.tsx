import { t } from '../../workspace/locale.ts';
import { useEffect, useRef, useState } from 'react';
import { addGoal, readGoals, updateGoal } from '../../../src/client/goals.ts';
import { GOAL_LIMIT } from '../../../src/shared/goals.ts';
import type { Goal, GoalAction, GoalsView as GoalsData } from '../../../src/shared/goals.ts';
import { FlagIcon, PlusIcon } from './Icons.tsx';

// Loads goals once, so Today can prompt the quarterly review and the task window can link plans.
export function useGoals() {
  const [view, setView] = useState<GoalsData | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    void readGoals().then(value => { if (mounted.current) setView(value); }).catch(() => { if (mounted.current) setError('Could not read goals.'); });
    return () => { mounted.current = false; };
  }, []);
  async function run(work: () => Promise<GoalsData>) {
    setBusy(true); setError('');
    try { const next = await work(); if (mounted.current) setView(next); return true; }
    catch (failure) { if (mounted.current) setError(failure instanceof Error ? failure.message : 'Could not save.'); return false; }
    finally { if (mounted.current) setBusy(false); }
  }
  const goals = view?.goals ?? [];
  const quarter = view?.quarter ?? '';
  return {
    quarter, busy, error,
    current: goals.filter(goal => goal.status === 'active' && goal.quarter === quarter),
    // Goals still open from an earlier quarter wait for the quarterly review.
    review: goals.filter(goal => goal.status === 'active' && goal.quarter < quarter),
    closed: goals.filter(goal => goal.status !== 'active'),
    // Plans can link to any open goal.
    linkable: goals.filter(goal => goal.status === 'active'),
    add: (title: string) => run(() => addGoal(title)),
    act: (id: string, action: GoalAction) => run(() => updateGoal(id, action)),
    reload: () => run(readGoals),
  };
}
export type GoalsController = ReturnType<typeof useGoals>;

const quarterName = (quarter: string) => t('Q{1} {0}', quarter.slice(0, 4), quarter.slice(6));

function GoalCard({ goal, busy, actions, onAct }: { goal: Goal; busy: boolean; actions: GoalAction[]; onAct(action: GoalAction): void }) {
  const labels: Record<GoalAction, string> = { done: 'Mark done', carry: 'Carry on this quarter', drop: 'Let it go' };
  return <li className="goal-card">
    <div className="goal-heading">
      <strong>{goal.title}</strong>
      <span className="consistency">{t("{0} done or checked in", goal.done)}</span>
    </div>
    {goal.links.length ? <p className="goal-links">{goal.links.map(link =>
      <span key={link.subject} className={link.habit ? 'goal-link habit' : 'goal-link'}>{link.title}</span>)}</p>
      : <p className="group-note">{t("Link tasks and habits to this goal in their editor.")}</p>}
    {actions.length > 0 && <div className="goal-actions">{actions.map(action =>
      <button key={action} type="button" className={action === 'done' ? 'quiet-button' : 'text-button'} disabled={busy}
        onClick={() => onAct(action)}>{t(labels[action])}</button>)}</div>}
  </li>;
}

// This quarter's goals, last quarter's still waiting for review, and closed ones.
export function GoalsView({ state, disabled }: { state: GoalsController; disabled: boolean }) {
  const [draft, setDraft] = useState('');
  const busy = disabled || state.busy;
  return <div className="goals">
    {state.error && <p className="error" role="alert">{t(state.error)}</p>}
    {state.review.length > 0 && <section className="list-group glass goal-group review" aria-label={t("Quarterly review")}>
      <div className="group-heading"><h2>{t("Quarterly review")}</h2><span className="count">{state.review.length}</span></div>
      <p className="group-note">{t("A new quarter has begun. For each goal from last quarter, mark it done, carry it on, or let it go.")}</p>
      <ul className="goal-list">{state.review.map(goal => <GoalCard key={goal.id} goal={goal} busy={busy}
        actions={['done', 'carry', 'drop']} onAct={action => void state.act(goal.id, action)} />)}</ul>
    </section>}
    <section className="list-group glass goal-group" aria-label={quarterName(state.quarter)}>
      <div className="group-heading"><h2>{state.quarter ? quarterName(state.quarter) : t("This quarter")}</h2><span className="count">{state.current.length}</span></div>
      <form className="goal-add" onSubmit={async event => {
        event.preventDefault();
        if (draft.trim() && await state.add(draft)) setDraft('');
      }}>
        <span className="quick-plus" aria-hidden="true"><PlusIcon /></span>
        <input aria-label={t("New goal")} value={draft} maxLength={200} disabled={busy} autoComplete="off"
          placeholder={t("A goal for this quarter, such as run a 10 km race")} onChange={event => setDraft(event.target.value)} />
      </form>
      {state.current.length >= GOAL_LIMIT && <p className="soft-note goal-note">{t("You already have {0} goals this quarter. A few goals get more attention each.", state.current.length)}</p>}
      {state.current.length ? <ul className="goal-list">{state.current.map(goal => <GoalCard key={goal.id} goal={goal} busy={busy}
        actions={['done', 'drop']} onAct={action => void state.act(goal.id, action)} />)}</ul>
        : <div className="goal-empty"><FlagIcon /><p>{t("Set one to three goals for the quarter, then link the tasks and habits that move them forward.")}</p></div>}
    </section>
    {state.closed.length > 0 && <section className="list-group glass goal-group closed" aria-label={t("Closed goals")}>
      <div className="group-heading"><h2>{t("Closed goals")}</h2><span className="count">{state.closed.length}</span></div>
      <ul className="goal-list">{state.closed.map(goal => <li key={goal.id} className="goal-card closed">
        <div className="goal-heading"><strong>{goal.title}</strong>
          <span className="state">{goal.status === 'done' ? t('Done') : t('Let go')} · {quarterName(goal.quarter)}</span></div>
      </li>)}</ul>
    </section>}
  </div>;
}
