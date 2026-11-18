import { t } from '../../workspace/locale.ts';
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence } from 'motion/react';
import type { ScoringRule } from '../../../src/shared/personal.ts';
import { isHabit, FOCUS_LIMIT } from '../../../src/shared/tasks.ts';
import type { Task, TaskView } from '../../../src/shared/tasks.ts';
import type { HabitInsight } from '../../../src/shared/habits.ts';
import { nextOccurrence } from '../../../src/shared/calendar.ts';
import { dateText } from '../view-options.ts';
import { ListItem } from './Animated.tsx';
import { CloseIcon, MoonIcon, PlayIcon, StarIcon } from './Icons.tsx';

// Close the day appears from this local time until the day is closed.
export const EVENING = '18:00';

interface CloseDayProps {
  open: boolean;
  view: TaskView;
  rules: Map<string, ScoringRule>;
  minutes: Record<string, number>;
  busy: boolean;
  insightFor(task: Task): HabitInsight;
  // Each save returns an error message, or an empty string after saving.
  onCancel(task: Task): Promise<string>;
  onMove(task: Task, date: string): Promise<string>;
  onFocus(day: string, ids: string[]): Promise<string>;
  onStartTwoMinutes(task: Task): void;
  onFinish(): void;
  onClose(): void;
}

// A short evening prompt on Today. Choosing Not tonight hides it until tomorrow.
export function EveningPrompt({ busy, onOpen, onDismiss }: { busy: boolean; onOpen(): void; onDismiss(): void }) {
  return <section className="evening-prompt glass" aria-label={t("Evening")}>
    <span className="evening-icon"><MoonIcon /></span>
    <p><strong>{t("Good evening")}</strong> {t("Take a minute to close the day: settle what is open and pick tomorrow's focus.")}</p>
    <div className="evening-actions">
      <button className="primary" disabled={busy} onClick={onOpen}>{t("Close the day")}</button>
      <button className="text-button" disabled={busy} onClick={onDismiss}>{t("Not tonight")}</button>
    </div>
  </section>;
}

// A one-minute evening routine: settle what is still open and decide tomorrow's first moves,
// so unfinished things stop circling in your head overnight.
export function CloseDaySheet(props: CloseDayProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (props.open && !element.open) element.showModal();
    else if (!props.open && element.open) element.close();
  }, [props.open]);
  return <dialog ref={dialog} className="sheet close-day" aria-labelledby="close-day-title"
    onCancel={event => { event.preventDefault(); if (!props.busy) props.onClose(); }}>
    {props.open && <CloseDayBody {...props} />}
  </dialog>;
}

function CloseDayBody({ view, rules, minutes, busy, insightFor, onCancel, onMove, onFocus, onStartTwoMinutes, onFinish, onClose }: CloseDayProps) {
  const [error, setError] = useState('');
  // The task whose date field is open, and the date chosen there.
  const [picking, setPicking] = useState<{ id: string; date: string } | null>(null);
  const tomorrow = nextOccurrence(view.today, 'daily') ?? view.today;
  // Habits with any logged minutes already count as showing up today.
  const habits = view.due.filter(task => isHabit(task) && (minutes[task.id] ?? 0) === 0);
  const tasks = view.due.filter(task => !isHabit(task) && !(rules.get(task.recurrenceId ?? task.id)?.mode === 'minutes'
    && (minutes[task.id] ?? 0) >= rules.get(task.recurrenceId ?? task.id)!.target));
  const movable = tasks.filter(task => !task.recurrenceId);
  const choices = [...view.due, ...view.upcoming].filter(task => !task.recurrenceId && task.plannedDate <= tomorrow);
  // A chosen task that was dropped or done tonight no longer takes a place.
  const focus = view.focus.tomorrow.filter(id => choices.some(task => task.id === id));
  const first = view.recurrences.filter(rule => rule.stoppedAt === null && rule.nextDate === tomorrow)
    .map(rule => ({ title: rule.title, plan: rules.get(rule.id) }))
    .filter(item => item.plan?.time).sort((a, b) => a.plan!.time.localeCompare(b.plan!.time))[0];
  async function run(action: Promise<string>) {
    setError('');
    const failure = await action;
    if (failure) setError(failure);
  }
  function toggle(task: Task) {
    const next = focus.includes(task.id) ? focus.filter(id => id !== task.id) : [...focus, task.id];
    if (next.length <= FOCUS_LIMIT) void run(onFocus(tomorrow, next));
  }
  // One save at a time; stops at the first error so nothing moves unseen.
  async function moveAll() {
    setError('');
    for (const task of movable) {
      const failure = await onMove(task, tomorrow);
      if (failure) { setError(failure); return; }
    }
  }

  return <div className="sheet-form">
    <header className="sheet-header">
      <div>
        <h2 id="close-day-title">{t("Close the day")}</h2>
        <p className="step-label">{t("About a minute. Decide once, then let it rest until tomorrow.")}</p>
      </div>
      <button type="button" className="icon-button" aria-label={t("Close")} disabled={busy} onClick={onClose}><CloseIcon /></button>
    </header>
    <div className="sheet-body">
      <section className="sheet-group" aria-labelledby="close-habits">
        <h3 id="close-habits"><span className="law">1</span>{t("Habits still open")}</h3>
        {habits.length === 0 ? <p className="group-note">{t("Every habit got some attention today.")}</p> : <ul className="close-list">
          <AnimatePresence initial={false} mode="popLayout">{habits.map(task => {
            const missedLast = insightFor(task).missedLast;
            return <ListItem key={task.id} className="close-row">
              <div className="close-item">
                <strong>{task.title}</strong>
                {missedLast && <span className="nudge">{t("Missed last time too. Two minutes now keeps the chain: never miss twice.")}</span>}
              </div>
              <div className="close-actions">
                <button className="primary" disabled={busy} aria-label={t("Do two minutes of {0} now", task.title)}
                  onClick={() => onStartTwoMinutes(task)}><PlayIcon />{t("2 min now")}</button>
                <button className="secondary-button" disabled={busy} aria-label={t("Rest today {0}", task.title)}
                  onClick={() => void run(onCancel(task))}><MoonIcon />{t("Rest today")}</button>
              </div>
            </ListItem>;
          })}</AnimatePresence>
        </ul>}
      </section>

      <section className="sheet-group" aria-labelledby="close-tasks">
        <div className="close-heading">
          <h3 id="close-tasks"><span className="law">2</span>{t("Tasks still open")}</h3>
          {movable.length > 1 && <button type="button" className="text-button" disabled={busy}
            onClick={() => void moveAll()}>{t("Move all to tomorrow")}</button>}
        </div>
        {tasks.length === 0 ? <p className="group-note">{t("Nothing left over.")}</p> : <ul className="close-list">
          <AnimatePresence initial={false} mode="popLayout">{tasks.map(task => <ListItem key={task.id} className="close-row">
            <div className="close-item">
              <strong>{task.title}</strong>
              <span className="task-meta">{(task.plannedDate < view.today ? t('Overdue · ') : '') + dateText(task.plannedDate)}</span>
            </div>
            {task.recurrenceId ? <button className="text-button" disabled={busy}
              onClick={() => void run(onCancel(task))}>{t("Skip this occurrence")}</button> : picking?.id === task.id ? <div className="close-actions">
              <input type="date" className="date-choice" aria-label={t("New date for {0}", task.title)} min={tomorrow} autoFocus
                value={picking.date} disabled={busy} onChange={event => setPicking({ id: task.id, date: event.target.value })} />
              <button className="quiet-button" disabled={busy || !picking.date} aria-label={t("Move {0} to the chosen date", task.title)}
                onClick={() => void run(onMove(task, picking.date))}>{t("Move")}</button>
              <button className="text-button" disabled={busy} onClick={() => setPicking(null)}>{t("Back")}</button>
            </div> : <div className="close-actions">
              <button className="secondary-button" disabled={busy} aria-label={t("Move {0} to tomorrow", task.title)}
                onClick={() => void run(onMove(task, tomorrow))}>{t("Tomorrow")}</button>
              <button className="secondary-button" disabled={busy} aria-label={t("Pick a date for {0}", task.title)}
                onClick={() => setPicking({ id: task.id, date: '' })}>{t("Pick date")}</button>
              <button className="text-button" disabled={busy} aria-label={t("Drop {0}", task.title)}
                onClick={() => void run(onCancel(task))}>{t("Drop")}</button>
            </div>}
          </ListItem>)}</AnimatePresence>
        </ul>}
      </section>

      <section className="sheet-group" aria-labelledby="close-focus">
        <h3 id="close-focus"><span className="law">3</span>{t("Tomorrow's focus")}<span className="focus-count">{t("{0} of {1}", focus.length, FOCUS_LIMIT)}</span></h3>
        <p className="group-note">{t("Pick up to three that matter most. Tomorrow's Next card starts with them, so the morning needs no deciding.")}</p>
        {choices.length === 0 ? <p className="group-note">{t("No one-off tasks are planned by tomorrow. Quick add can plan one.")}</p>
          : <div className="focus-choices" role="group" aria-label={t("Tomorrow's focus")}>
            {choices.map(task => {
              const on = focus.includes(task.id);
              return <button key={task.id} type="button" className={`focus-choice ${on ? 'on' : ''}`} aria-pressed={on}
                aria-label={t("Focus on {0} tomorrow", task.title)}
                disabled={busy || (!on && focus.length >= FOCUS_LIMIT)} onClick={() => toggle(task)}>
                <StarIcon /><span>{task.title}</span>
              </button>;
            })}
          </div>}
      </section>

      <section className="sheet-preview" aria-label={t("Set up tomorrow")}>
        <p className="preview-title">{t("Set up tomorrow")}</p>
        {first ? <>
          <p>{t("First up: {0} at {1}", first.title, first.plan!.time)}{first.plan!.place ? ' · ' + first.plan!.place : ''}.</p>
          <p>{first.plan!.starter ? t('Get ready now for the two-minute start: ') + first.plan!.starter.replace(/[.!?]+$/, '') + '.'
            : t('Put what you need for it where you will see it.')}</p>
        </> : <p>{t("Put what you need for tomorrow's first step where you will see it in the morning.")}</p>}
      </section>
    </div>
    <footer className="sheet-footer">
      {error && <p role="alert" className="error">{t(error)}</p>}
      <button type="button" className="secondary-button" disabled={busy} onClick={onClose}>{t("Not now")}</button>
      <button type="button" className="primary" disabled={busy} onClick={onFinish}>{t("Done for today")}</button>
    </footer>
  </div>;
}
