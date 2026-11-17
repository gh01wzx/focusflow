import { useEffect, useRef, useState } from 'react';
import { AnimatePresence } from 'motion/react';
import type { ScoringRule } from '../../../src/shared/personal.ts';
import { FOCUS_LIMIT } from '../../../src/shared/tasks.ts';
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
  return <section className="evening-prompt glass" aria-label="Evening">
    <span className="evening-icon"><MoonIcon /></span>
    <p><strong>Good evening</strong> Take a minute to close the day: settle what is open and pick tomorrow&apos;s focus.</p>
    <div className="evening-actions">
      <button className="primary" disabled={busy} onClick={onOpen}>Close the day</button>
      <button className="text-button" disabled={busy} onClick={onDismiss}>Not tonight</button>
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
  const habits = view.due.filter(task => task.recurrenceId && (minutes[task.id] ?? 0) === 0);
  const tasks = view.due.filter(task => !task.recurrenceId);
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
    for (const task of tasks) {
      const failure = await onMove(task, tomorrow);
      if (failure) { setError(failure); return; }
    }
  }

  return <div className="sheet-form">
    <header className="sheet-header">
      <div>
        <h2 id="close-day-title">Close the day</h2>
        <p className="step-label">About a minute. Decide once, then let it rest until tomorrow.</p>
      </div>
      <button type="button" className="icon-button" aria-label="Close" disabled={busy} onClick={onClose}><CloseIcon /></button>
    </header>
    <div className="sheet-body">
      <section className="sheet-group" aria-labelledby="close-habits">
        <h3 id="close-habits"><span className="law">1</span>Habits still open</h3>
        {habits.length === 0 ? <p className="group-note">Every habit got some attention today.</p> : <ul className="close-list">
          <AnimatePresence initial={false} mode="popLayout">{habits.map(task => {
            const missedLast = insightFor(task).missedLast;
            return <ListItem key={task.id} className="close-row">
              <div className="close-item">
                <strong>{task.title}</strong>
                {missedLast && <span className="nudge">Missed last time too. Two minutes now keeps the chain: never miss twice.</span>}
              </div>
              <div className="close-actions">
                <button className="primary" disabled={busy} aria-label={`Do two minutes of ${task.title} now`}
                  onClick={() => onStartTwoMinutes(task)}><PlayIcon />2 min now</button>
                <button className="secondary-button" disabled={busy} aria-label={`Rest today ${task.title}`}
                  onClick={() => void run(onCancel(task))}><MoonIcon />Rest today</button>
              </div>
            </ListItem>;
          })}</AnimatePresence>
        </ul>}
      </section>

      <section className="sheet-group" aria-labelledby="close-tasks">
        <div className="close-heading">
          <h3 id="close-tasks"><span className="law">2</span>Tasks still open</h3>
          {tasks.length > 1 && <button type="button" className="text-button" disabled={busy}
            onClick={() => void moveAll()}>Move all to tomorrow</button>}
        </div>
        {tasks.length === 0 ? <p className="group-note">Nothing left over.</p> : <ul className="close-list">
          <AnimatePresence initial={false} mode="popLayout">{tasks.map(task => <ListItem key={task.id} className="close-row">
            <div className="close-item">
              <strong>{task.title}</strong>
              <span className="task-meta">{(task.plannedDate < view.today ? 'Overdue · ' : '') + dateText(task.plannedDate)}</span>
            </div>
            {picking?.id === task.id ? <div className="close-actions">
              <input type="date" className="date-choice" aria-label={`New date for ${task.title}`} min={tomorrow} autoFocus
                value={picking.date} disabled={busy} onChange={event => setPicking({ id: task.id, date: event.target.value })} />
              <button className="quiet-button" disabled={busy || !picking.date} aria-label={`Move ${task.title} to the chosen date`}
                onClick={() => void run(onMove(task, picking.date))}>Move</button>
              <button className="text-button" disabled={busy} onClick={() => setPicking(null)}>Back</button>
            </div> : <div className="close-actions">
              <button className="secondary-button" disabled={busy} aria-label={`Move ${task.title} to tomorrow`}
                onClick={() => void run(onMove(task, tomorrow))}>Tomorrow</button>
              <button className="secondary-button" disabled={busy} aria-label={`Pick a date for ${task.title}`}
                onClick={() => setPicking({ id: task.id, date: '' })}>Pick date</button>
              <button className="text-button" disabled={busy} aria-label={`Drop ${task.title}`}
                onClick={() => void run(onCancel(task))}>Drop</button>
            </div>}
          </ListItem>)}</AnimatePresence>
        </ul>}
      </section>

      <section className="sheet-group" aria-labelledby="close-focus">
        <h3 id="close-focus"><span className="law">3</span>Tomorrow&apos;s focus<span className="focus-count">{focus.length} of {FOCUS_LIMIT}</span></h3>
        <p className="group-note">Pick up to three that matter most. Tomorrow&apos;s Next card starts with them, so the morning needs no deciding.</p>
        {choices.length === 0 ? <p className="group-note">No one-off tasks are planned by tomorrow. Quick add can plan one.</p>
          : <div className="focus-choices" role="group" aria-label="Tomorrow's focus">
            {choices.map(task => {
              const on = focus.includes(task.id);
              return <button key={task.id} type="button" className={`focus-choice ${on ? 'on' : ''}`} aria-pressed={on}
                aria-label={`Focus on ${task.title} tomorrow`}
                disabled={busy || (!on && focus.length >= FOCUS_LIMIT)} onClick={() => toggle(task)}>
                <StarIcon /><span>{task.title}</span>
              </button>;
            })}
          </div>}
      </section>

      <section className="sheet-preview" aria-label="Set up tomorrow">
        <p className="preview-title">Set up tomorrow</p>
        {first ? <>
          <p>First up: {first.title} at {first.plan!.time}{first.plan!.place ? ' · ' + first.plan!.place : ''}.</p>
          <p>{first.plan!.starter ? 'Get ready now for the two-minute start: ' + first.plan!.starter.replace(/[.!?]+$/, '') + '.'
            : 'Put what you need for it where you will see it.'}</p>
        </> : <p>Put what you need for tomorrow&apos;s first step where you will see it in the morning.</p>}
      </section>
    </div>
    <footer className="sheet-footer">
      {error && <p role="alert" className="error">{error}</p>}
      <button type="button" className="secondary-button" disabled={busy} onClick={onClose}>Not now</button>
      <button type="button" className="primary" disabled={busy} onClick={onFinish}>Done for today</button>
    </footer>
  </div>;
}
