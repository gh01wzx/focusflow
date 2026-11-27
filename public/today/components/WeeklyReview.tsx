import { t } from '../../workspace/locale.ts';
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence } from 'motion/react';
import type { Outcome } from '../../../src/shared/personal.ts';
import { addDays } from '../../../src/shared/calendar.ts';
import { HABIT_LIMIT, identityKey } from '../../../src/shared/habits.ts';
import type { HabitReview, Progress } from '../../../src/shared/habits.ts';
import { readReviewChanges, writeReviewChanges } from '../local-state.ts';
import { ListItem } from './Animated.tsx';
import { CloseIcon, PencilIcon, SparkIcon } from './Icons.tsx';

const outcomeText: Record<Outcome, string> = { done: 'done', started: 'showed up', missed: 'missed', rest: 'rest day' };
const shortDate = (day: string) => new Intl.DateTimeFormat(document.documentElement.lang, { month: 'short', day: 'numeric', timeZone: 'UTC' })
  .format(new Date(day + 'T12:00:00Z'));
const rate = (progress: Progress) => progress.total ? progress.done / progress.total : 0;

// The Monday of the week that contains the date. The review prompt shows once per week.
export function weekOf(day: string): string {
  return addDays(day, -((new Date(day + 'T12:00:00Z').getUTCDay() + 6) % 7));
}

// A short prompt on Today at the start of a week. Not this week hides it until next Monday.
export function WeekPrompt({ busy, onOpen, onDismiss }: { busy: boolean; onOpen(): void; onDismiss(): void }) {
  return <section className="evening-prompt week-prompt glass" aria-label={t("New week")}>
    <span className="evening-icon"><SparkIcon /></span>
    <p><strong>{t("New week")}</strong> {t("Take a minute to see how your habits went and tune them for the week ahead.")}</p>
    <div className="evening-actions">
      <button className="primary" disabled={busy} onClick={onOpen}>{t("Review week")}</button>
      <button className="text-button" disabled={busy} onClick={onDismiss}>{t("Not this week")}</button>
    </div>
  </section>;
}

interface ReviewProps {
  open: boolean;
  today: string;
  reviews: HabitReview[];
  votes: Record<string, number>;
  busy: boolean;
  // Each save returns an error message, or an empty string after saving.
  onTarget(review: HabitReview, target: number): Promise<string>;
  onGraduate(review: HabitReview): Promise<string>;
  // These close the review and open the task window.
  onEditPlan(review: HabitReview): void;
  onStack(review: HabitReview): void;
  // Ideas waiting in Someday, a good moment to plan one or two.
  someday: number;
  onOpenSomeday(): void;
  onFinish(): void;
  onClose(): void;
}

// Once a week: how each habit went over the last seven days, with at most one suggestion each.
// Every suggestion is one tap, so tuning a habit takes less effort than thinking about it.
export function WeeklyReview(props: ReviewProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (props.open && !element.open) element.showModal();
    else if (!props.open && element.open) element.close();
  }, [props.open]);
  return <dialog ref={dialog} className="sheet weekly-review" aria-labelledby="review-title"
    onCancel={event => { event.preventDefault(); if (!props.busy) props.onClose(); }}>
    {props.open && <ReviewBody {...props} />}
  </dialog>;
}

function advice(review: HabitReview): string {
  const { week, before, suggestion } = review;
  switch (suggestion.kind) {
    case 'new': return t("New habit. Keep showing up; suggestions start after about two weeks.");
    case 'steady': return t("Steady for two weeks. Keep the plan as it is.");
    case 'stack': return t("Steady for two weeks. Build on it by stacking a new habit right after it.");
    case 'grow': return t("Target met steadily for two weeks. Ready for {0} min a day?", suggestion.target);
    case 'ease': return t("Showed up {0} of {1} times. ", week.done, week.total)
      + (suggestion.target ? t("Make it easier: {0} min a day still counts.", suggestion.target) : t('Try a smaller start or a different cue.'));
    case 'graduate': return t("Steady after {0} days. If it feels automatic, graduate it: it leaves Today and its history stays.", suggestion.days);
    case 'keep':
      if (before.total && week.total && rate(week) > rate(before)) return t("Up on the week before. Keep going.");
      if (before.total && week.total && rate(week) < rate(before)) return t("A dip from the week before. Never miss twice; two minutes counts.");
      return t("Keep going.");
  }
}

function ReviewBody({ today, reviews, votes, busy, onTarget, onGraduate, onEditPlan, onStack, someday, onOpenSomeday, onFinish, onClose }: ReviewProps) {
  const [error, setError] = useState('');
  // Suggestions taken this week stay taken, so a changed habit does not suggest another step
  // before you have tried the new one for a week.
  const week = weekOf(today);
  const [applied, setApplied] = useState(() => readReviewChanges(week));
  const [confirming, setConfirming] = useState('');
  const shown = reviews.reduce((sum, review) => sum + review.week.done, 0);
  const total = reviews.reduce((sum, review) => sum + review.week.total, 0);
  const earlier = reviews.reduce((sum, review) => sum + review.before.done, 0);
  const change = shown - earlier;
  const identities = [...new Map(reviews.filter(review => review.identity).map(review => {
    const key = identityKey(review.identity);
    const week = reviews.filter(item => item.identity && identityKey(item.identity) === key)
      .reduce((sum, item) => sum + item.week.done, 0);
    return [key, { key, label: review.identity, week, total: votes[key] ?? 0 }] as const;
  })).values()];

  async function save(review: HabitReview, action: Promise<string>, done: string) {
    setError('');
    const failure = await action;
    if (failure) { setError(failure); return; }
    const next = { ...applied, [review.id]: done };
    setApplied(next); writeReviewChanges(week, next);
  }

  return <div className="sheet-form">
    <header className="sheet-header">
      <div>
        <h2 id="review-title">{t("Weekly review")}</h2>
        <p className="step-label">{t("{0} to {1}. A minute to tune the week ahead.", shortDate(addDays(today, -7)), shortDate(addDays(today, -1)))}</p>
      </div>
      <button type="button" className="icon-button" aria-label={t("Close")} disabled={busy} onClick={onClose}><CloseIcon /></button>
    </header>
    <div className="sheet-body">
      <section className="sheet-preview review-summary" aria-label={t("Last seven days")}>
        <p className="preview-title">{total ? t("You showed up {0} of {1} times.", shown, total) : t('No habit was scheduled in the last seven days.')}</p>
        {total > 0 && earlier > 0 && change !== 0 && <p>{t(change > 0 ? "{0} more than the week before." : "{0} fewer than the week before.", Math.abs(change))}</p>}
        {identities.length > 0 && <ul className="vote-chips" aria-label={t("Identity votes")}>
          {identities.map(item => <li key={item.key}><strong>{item.label}</strong>
            {' · ' + t('{0} this week · {1} in all', item.week, item.total)}</li>)}
        </ul>}
      </section>
      {reviews.length > HABIT_LIMIT && <p className="soft-note">{t("You are building {0} habits at once. Habits stick better a few at a time; graduate or stop one when you are ready.", reviews.length)}</p>}

      <section className="sheet-group" aria-labelledby="review-habits">
        <h3 id="review-habits">{t("Your habits")}</h3>
        {reviews.length === 0 ? <p className="group-note">{t("Add a habit with New habit to see it here next week.")}</p> : <ul className="close-list">
          <AnimatePresence initial={false} mode="popLayout">{reviews.map(review => {
            const { suggestion } = review;
            const done = applied[review.id];
            return <ListItem key={review.id} className="close-row review-row">
              <div className="close-item">
                <div className="review-head">
                  <strong>{review.title}</strong>
                  {review.week.total > 0 && <span className="consistency" title={t("Shown up out of scheduled days, rest days aside")}>
                    {review.week.done}/{review.week.total}</span>}
                </div>
                {review.marks.length > 0 && <span className="dots" role="img"
                  aria-label={t('Last seven days: ') + review.marks.map(mark => outcomeText[mark]).join(', ')}>
                  {review.marks.map((mark, index) => <i key={index} data-mark={mark} />)}</span>}
                <p className="review-note">{done ? t(done) : advice(review)}</p>
              </div>
              {!done && confirming === review.id ? <div className="close-actions">
                <button className="primary" disabled={busy} aria-label={t("Confirm graduating {0}", review.title)}
                  onClick={() => void save(review, onGraduate(review), 'Graduated. Well done.')}>{t("Graduate")}</button>
                <button className="text-button" disabled={busy} onClick={() => setConfirming('')}>{t("Keep it")}</button>
              </div> : !done && <div className="close-actions">
                {(suggestion.kind === 'grow' || suggestion.kind === 'ease') && suggestion.target !== null && <button className="primary" disabled={busy}
                  aria-label={t("Change {0} to {1} minutes a day", review.title, suggestion.target)}
                  onClick={() => void save(review, onTarget(review, suggestion.target!), t("Now {0} min a day.", suggestion.target!))}>
                  {t("Make it {0} min", suggestion.target!)}</button>}
                {suggestion.kind === 'ease' && <button className="secondary-button" disabled={busy} aria-label={t("Edit plan for {0}", review.title)}
                  onClick={() => onEditPlan(review)}><PencilIcon />{t("Edit plan")}</button>}
                {suggestion.kind === 'stack' && <button className="primary" disabled={busy} aria-label={t("Stack a new habit after {0}", review.title)}
                  onClick={() => onStack(review)}><SparkIcon />{t("Stack a habit")}</button>}
                {suggestion.kind === 'graduate' && <button className="primary" disabled={busy} aria-label={t("Graduate {0}", review.title)}
                  onClick={() => setConfirming(review.id)}>{t("Graduate")}</button>}
              </div>}
            </ListItem>;
          })}</AnimatePresence>
        </ul>}
      </section>
      {someday > 0 && <section className="sheet-group someday-note">
        <p>{t("{0} ideas wait in Someday. Plan one or two for this week.", someday)}</p>
        <button type="button" className="quiet-button" disabled={busy} onClick={onOpenSomeday}>{t("Open Someday")}</button>
      </section>}
    </div>
    <footer className="sheet-footer">
      {error && <p role="alert" className="error">{t(error)}</p>}
      <button type="button" className="secondary-button" disabled={busy} onClick={onClose}>{t("Not now")}</button>
      <button type="button" className="primary" disabled={busy} onClick={onFinish}>{t("Done for this week")}</button>
    </footer>
  </div>;
}
