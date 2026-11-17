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
const shortDate = (day: string) => new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', timeZone: 'UTC' })
  .format(new Date(day + 'T12:00:00Z'));
const rate = (progress: Progress) => progress.total ? progress.done / progress.total : 0;

// The Monday of the week that contains the date. The review prompt shows once per week.
export function weekOf(day: string): string {
  return addDays(day, -((new Date(day + 'T12:00:00Z').getUTCDay() + 6) % 7));
}

// A short prompt on Today at the start of a week. Not this week hides it until next Monday.
export function WeekPrompt({ busy, onOpen, onDismiss }: { busy: boolean; onOpen(): void; onDismiss(): void }) {
  return <section className="evening-prompt week-prompt glass" aria-label="New week">
    <span className="evening-icon"><SparkIcon /></span>
    <p><strong>New week</strong> Take a minute to see how your habits went and tune them for the week ahead.</p>
    <div className="evening-actions">
      <button className="primary" disabled={busy} onClick={onOpen}>Review week</button>
      <button className="text-button" disabled={busy} onClick={onDismiss}>Not this week</button>
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
    case 'new': return 'New habit. Keep showing up; suggestions start after about two weeks.';
    case 'steady': return 'Steady for two weeks. Keep the plan as it is.';
    case 'stack': return 'Steady for two weeks. Build on it by stacking a new habit right after it.';
    case 'grow': return `Target met steadily for two weeks. Ready for ${suggestion.target} min a day?`;
    case 'ease': return `Showed up ${week.done} of ${week.total} times. `
      + (suggestion.target ? `Make it easier: ${suggestion.target} min a day still counts.` : 'Try a smaller start or a different cue.');
    case 'graduate': return `Steady after ${suggestion.days} days. If it feels automatic, graduate it: it leaves Today and its history stays.`;
    case 'keep':
      if (before.total && week.total && rate(week) > rate(before)) return 'Up on the week before. Keep going.';
      if (before.total && week.total && rate(week) < rate(before)) return 'A dip from the week before. Never miss twice; two minutes counts.';
      return 'Keep going.';
  }
}

function ReviewBody({ today, reviews, votes, busy, onTarget, onGraduate, onEditPlan, onStack, onFinish, onClose }: ReviewProps) {
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
        <h2 id="review-title">Weekly review</h2>
        <p className="step-label">{shortDate(addDays(today, -7))} to {shortDate(addDays(today, -1))}. A minute to tune the week ahead.</p>
      </div>
      <button type="button" className="icon-button" aria-label="Close" disabled={busy} onClick={onClose}><CloseIcon /></button>
    </header>
    <div className="sheet-body">
      <section className="sheet-preview review-summary" aria-label="Last seven days">
        <p className="preview-title">{total ? `You showed up ${shown} of ${total} times.` : 'No habit was scheduled in the last seven days.'}</p>
        {total > 0 && earlier > 0 && change !== 0 && <p>{Math.abs(change)} {change > 0 ? 'more' : 'fewer'} than the week before.</p>}
        {identities.length > 0 && <ul className="vote-chips" aria-label="Identity votes">
          {identities.map(item => <li key={item.key}><strong>{item.label}</strong>
            {' · ' + item.week + ' this week · ' + item.total + ' in all'}</li>)}
        </ul>}
      </section>
      {reviews.length > HABIT_LIMIT && <p className="soft-note">You are building {reviews.length} habits at once.
        Habits stick better a few at a time; graduate or stop one when you are ready.</p>}

      <section className="sheet-group" aria-labelledby="review-habits">
        <h3 id="review-habits">Your habits</h3>
        {reviews.length === 0 ? <p className="group-note">Add a habit with New habit to see it here next week.</p> : <ul className="close-list">
          <AnimatePresence initial={false} mode="popLayout">{reviews.map(review => {
            const { suggestion } = review;
            const done = applied[review.id];
            return <ListItem key={review.id} className="close-row review-row">
              <div className="close-item">
                <div className="review-head">
                  <strong>{review.title}</strong>
                  {review.week.total > 0 && <span className="consistency" title="Shown up out of scheduled days, rest days aside">
                    {review.week.done}/{review.week.total}</span>}
                </div>
                {review.marks.length > 0 && <span className="dots" role="img"
                  aria-label={'Last seven days: ' + review.marks.map(mark => outcomeText[mark]).join(', ')}>
                  {review.marks.map((mark, index) => <i key={index} data-mark={mark} />)}</span>}
                <p className="review-note">{done ?? advice(review)}</p>
              </div>
              {!done && confirming === review.id ? <div className="close-actions">
                <button className="primary" disabled={busy} aria-label={`Confirm graduating ${review.title}`}
                  onClick={() => void save(review, onGraduate(review), 'Graduated. Well done.')}>Graduate</button>
                <button className="text-button" disabled={busy} onClick={() => setConfirming('')}>Keep it</button>
              </div> : !done && <div className="close-actions">
                {(suggestion.kind === 'grow' || (suggestion.kind === 'ease' && suggestion.target)) && <button className="primary" disabled={busy}
                  aria-label={`Change ${review.title} to ${suggestion.target} minutes a day`}
                  onClick={() => void save(review, onTarget(review, suggestion.target!), `Now ${suggestion.target} min a day.`)}>
                  Make it {suggestion.target} min</button>}
                {suggestion.kind === 'ease' && <button className="secondary-button" disabled={busy} aria-label={`Edit plan for ${review.title}`}
                  onClick={() => onEditPlan(review)}><PencilIcon />Edit plan</button>}
                {suggestion.kind === 'stack' && <button className="primary" disabled={busy} aria-label={`Stack a new habit after ${review.title}`}
                  onClick={() => onStack(review)}><SparkIcon />Stack a habit</button>}
                {suggestion.kind === 'graduate' && <button className="primary" disabled={busy} aria-label={`Graduate ${review.title}`}
                  onClick={() => setConfirming(review.id)}>Graduate</button>}
              </div>}
            </ListItem>;
          })}</AnimatePresence>
        </ul>}
      </section>
    </div>
    <footer className="sheet-footer">
      {error && <p role="alert" className="error">{error}</p>}
      <button type="button" className="secondary-button" disabled={busy} onClick={onClose}>Not now</button>
      <button type="button" className="primary" disabled={busy} onClick={onFinish}>Done for this week</button>
    </footer>
  </div>;
}
