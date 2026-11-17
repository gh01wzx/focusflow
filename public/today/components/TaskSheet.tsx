import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { emptyPlan, points } from '../../../src/shared/personal.ts';
import type { HabitPlan, ScoringRule } from '../../../src/shared/personal.ts';
import type { Frequency, Task, TaskDraft, Weekday } from '../../../src/shared/tasks.ts';
import { WEEKDAYS } from '../../../src/shared/weekdays.ts';
import { HABIT_LIMIT, cueLine } from '../../../src/shared/habits.ts';
import { dateText } from '../view-options.ts';
import { WeekdayPicker } from './WeekdayPicker.tsx';
import { CloseIcon } from './Icons.tsx';

type Kind = 'once' | 'repeat' | 'timed';
// A guided request walks through a new habit one question at a time. A cue starts the
// "After I" field, for example when stacking a new habit after a steady one.
export type SheetRequest = { mode: 'create'; id: string; guided?: boolean; title?: string; cue?: string }
  | { mode: 'edit'; id: string; task: Task; rule: ScoringRule | undefined };
export interface PlanUpdate extends HabitPlan { mode: 'minutes' | 'complete'; rate: number; target: number }

interface SheetProps {
  request: SheetRequest | null;
  today: string;
  busy: boolean;
  reward: { title: string; remaining: number } | null;
  // Moments the user already relies on, offered as one-tap cues.
  anchors: string[];
  // Repeating habits already scheduled, for a gentle note when adding more than a few.
  habits: number;
  // Each returns an error message, or an empty string after saving.
  onCreate(draft: TaskDraft): Promise<string>;
  onSavePlan(task: Task, update: PlanUpdate): Promise<string>;
  onClose(): void;
}

const kinds: { value: Kind; label: string; hint: string }[] = [
  { value: 'once', label: 'One-off', hint: 'Done once on a planned date.' },
  { value: 'repeat', label: 'Repeating', hint: 'Checked off each day or on chosen weekdays.' },
  { value: 'timed', label: 'Timed habit', hint: 'Log minutes toward a small daily target.' },
];
const steps = ['What and when', 'Make it obvious', 'Make it easy', 'Make it satisfying'];

// A modal window for creating a task or editing its habit plan. The native dialog keeps
// keyboard focus inside and returns it to the opening button when it closes.
export function TaskSheet(props: SheetProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  // The last request stays rendered while the window animates closed.
  const [last, setLast] = useState<SheetRequest | null>(null);
  const current = props.request ?? last;
  useEffect(() => {
    const element = dialog.current;
    if (props.request) {
      setLast(props.request);
      if (element && !element.open) {
        element.showModal();
        // React's autoFocus runs before the dialog opens, so focus the first field here.
        element.querySelector<HTMLElement>('[data-autofocus]')?.focus();
      }
      return;
    }
    if (element?.open) element.close();
    const timer = setTimeout(() => setLast(null), 320);
    return () => clearTimeout(timer);
  }, [props.request]);
  return <dialog ref={dialog} className="sheet" aria-labelledby="sheet-title"
    onCancel={event => { event.preventDefault(); if (!props.busy) props.onClose(); }}>
    {current && <SheetForm key={current.id} {...props} request={current} />}
  </dialog>;
}

function planOf(rule: ScoringRule | undefined): HabitPlan {
  if (!rule) return emptyPlan;
  return { cue: rule.cue, identity: rule.identity, time: rule.time, place: rule.place, starter: rule.starter, bundle: rule.bundle };
}

function SheetForm({ request, today, busy, reward, anchors, habits, onCreate, onSavePlan, onClose }: SheetProps & { request: SheetRequest }) {
  const editing = request.mode === 'edit' ? request : null;
  const guided = request.mode === 'create' && !!request.guided;
  const rule = editing?.rule;
  const form = useRef<HTMLFormElement>(null);
  const [step, setStep] = useState(0);
  const [kind, setKind] = useState<Kind>(guided ? 'repeat' : !editing ? 'once'
    : !editing.task.recurrenceId ? 'once' : rule?.mode === 'minutes' ? 'timed' : 'repeat');
  const [title, setTitle] = useState(request.mode === 'create' ? request.title ?? '' : '');
  const [date, setDate] = useState(today);
  const [frequency, setFrequency] = useState<Frequency>('daily');
  const [weekdays, setWeekdays] = useState<Weekday[]>([]);
  // Number fields keep their typed text, so clearing one does not snap it back to zero.
  const [donePoints, setDonePoints] = useState(rule?.mode === 'complete' ? String(rule.rate / 100) : '5');
  const [minutePoints, setMinutePoints] = useState(rule?.mode === 'minutes' ? String(rule.rate / 100) : '1');
  const [target, setTarget] = useState(rule?.mode === 'minutes' ? String(rule.target) : '5');
  const [plan, setPlan] = useState<HabitPlan>(request.mode === 'create' && request.cue ? { ...emptyPlan, cue: request.cue } : planOf(rule));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const repeating = kind !== 'once';
  const pointsText = kind === 'timed' ? minutePoints : donePoints;
  const field = (key: keyof HabitPlan) => (event: ChangeEvent<HTMLInputElement>) =>
    setPlan(current => ({ ...current, [key]: event.target.value }));
  const basicsMissing = !editing && (!title.trim() || (repeating && frequency === 'weekly' && !weekdays.length));
  const blocked = saving || busy || basicsMissing;
  const shownStep = (index: number) => !guided || step === index;

  // Each guided step starts in its first field, so the keyboard flow stays Enter, type, Enter.
  useEffect(() => {
    if (guided && step > 0) form.current?.querySelector<HTMLElement>('[data-step-focus]')?.focus();
  }, [guided, step]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (guided && step < steps.length - 1) {
      if (step > 0 || !basicsMissing) setStep(step + 1);
      return;
    }
    if (blocked) return;
    setSaving(true); setError('');
    // Fields hidden for the chosen kind are saved empty.
    const shown: HabitPlan = { ...plan, cue: repeating ? plan.cue : '', identity: repeating ? plan.identity : '', bundle: repeating ? plan.bundle : '' };
    const rate = Math.round(Number(pointsText) * 100);
    const minutes = kind === 'timed' ? Number(target) : 0;
    const failure = editing
      ? await onSavePlan(editing.task, { ...shown, mode: kind === 'timed' ? 'minutes' : 'complete', rate, target: minutes })
      : await onCreate({ title, plannedDate: date, frequency: repeating ? frequency : 'none', habit: kind === 'timed',
        ...(repeating && frequency === 'weekly' ? { weekdays } : {}), plan: { ...shown, rate, target: minutes } });
    setSaving(false);
    if (failure) setError(failure); else onClose();
  }

  const subject = editing?.task.title ?? title.trim();
  const schedule = editing
    ? (editing.task.frequency ? (editing.task.frequency === 'daily' ? 'Daily' : 'Weekly') : 'Once') + ' · ' + dateText(editing.task.plannedDate)
    : !repeating ? dateText(date)
      : frequency === 'daily' ? 'Daily from ' + dateText(date)
        : (weekdays.length ? WEEKDAYS.filter(day => weekdays.includes(day.value)).map(day => day.label).join(', ') : 'Choose weekdays') + ' from ' + dateText(date);
  const scoreText = kind === 'timed' ? points(Math.round(Number(minutePoints) * 100)) + ' pt/min' : '+' + points(Math.round(Number(donePoints) * 100)) + ' points';
  const choices = [...new Set([...anchors, 'wake up', 'pour my morning coffee', 'sit down at my desk', 'finish lunch',
    'get home', 'finish dinner', 'get into bed'].map(item => item.trim()).filter(Boolean))].slice(0, 8);
  const easy = <section className="sheet-group" aria-labelledby="law-easy">
    <h3 id="law-easy"><span className="law">3</span>Make it easy</h3>
    <label className="field">Two-minute version
      <input value={plan.starter} maxLength={180} placeholder={repeating ? 'Put on my running shoes' : 'Open the file and write one line'}
        disabled={saving} onChange={field('starter')} data-step-focus /></label>
    {kind === 'timed' && <div className="field">
      <span id="target-label">Daily target in minutes</span>
      <div className="chip-row" role="group" aria-labelledby="target-label">
        {[2, 5, 10, 20, 30].map(value => <button key={value} type="button" disabled={saving}
          className={`chip ${Number(target) === value ? 'selected' : ''}`} onClick={() => setTarget(String(value))}>{value}</button>)}
        <input type="number" aria-labelledby="target-label" min="1" max="1440" step="1" required value={target} disabled={saving}
          onChange={event => setTarget(event.target.value)} />
      </div>
    </div>}
    <p className="group-note">Start smaller than feels useful. Doing only the two-minute version still counts as showing up.</p>
  </section>;

  return <form ref={form} className="sheet-form" onSubmit={event => void submit(event)}>
    <header className="sheet-header">
      <div>
        <h2 id="sheet-title">{editing ? 'Edit plan' : guided || kind === 'timed' ? 'New habit' : 'New task'}</h2>
        {guided && <p className="step-label" aria-live="polite">Step {step + 1} of {steps.length} &middot; {steps[step]}</p>}
      </div>
      <button type="button" className="icon-button" aria-label="Close" disabled={saving} onClick={onClose}><CloseIcon /></button>
    </header>
    {guided && <ol className="step-dots" aria-hidden="true">{steps.map((name, index) =>
      <li key={name} className={index === step ? 'current' : index < step ? 'past' : ''} />)}</ol>}
    <div className="sheet-body">
      {shownStep(0) && <>
        <fieldset className="segmented" disabled={saving}>
          <legend className="sr-only">Kind</legend>
          {kinds.filter(item => !guided || item.value !== 'once').map(item => {
            const locked = !!editing && (editing.task.recurrenceId ? item.value === 'once' : item.value !== 'once');
            return <label key={item.value} className={kind === item.value ? 'selected' : ''} title={item.hint}>
              <input type="radio" name="kind" value={item.value} checked={kind === item.value} disabled={locked}
                onChange={() => setKind(item.value)} />{item.label}
            </label>;
          })}
        </fieldset>
        <p className="kind-hint">{kinds.find(item => item.value === kind)!.hint}</p>

        {editing ? <section className="sheet-group">
          <p className="sheet-subject">{'“' + editing.task.title + '”'}</p>
          <p className="group-note">{schedule}. The title and schedule stay as created; stop repeating and add a new one to change them.</p>
        </section> : <section className="sheet-group">
          <input className="title-input" aria-label="Task title" value={title} maxLength={300} required data-autofocus autoComplete="off"
            placeholder={guided ? 'What habit do you want to build?' : kind === 'timed' ? 'What will you practice?' : 'What will you do?'}
            disabled={saving} onChange={event => setTitle(event.target.value)} />
          <div className="field-row">
            <label htmlFor="sheet-date">{repeating ? 'Start date' : 'Planned date'}</label>
            <input id="sheet-date" aria-label="Planned date" type="date" value={date} required disabled={saving}
              min={repeating ? today : undefined} onChange={event => setDate(event.target.value)} />
          </div>
          {repeating && <div className="field-row">
            <label htmlFor="sheet-repeat">Repeat</label>
            <select id="sheet-repeat" value={frequency} disabled={saving}
              onChange={event => setFrequency(event.target.value === 'weekly' ? 'weekly' : 'daily')}>
              <option value="daily">Daily</option><option value="weekly">Weekly</option>
            </select>
          </div>}
          {repeating && frequency === 'weekly' && <WeekdayPicker selected={weekdays} disabled={saving} onChange={setWeekdays} />}
        </section>}
        {!editing && repeating && habits >= HABIT_LIMIT && <p className="soft-note">You are already building {habits} habits.
          New habits stick better one at a time, so you might add this one when another feels easy.</p>}
      </>}

      {shownStep(1) && <section className="sheet-group" aria-labelledby="law-obvious">
        <h3 id="law-obvious"><span className="law">1</span>Make it obvious</h3>
        {repeating && <>
          <label className="field">After I&hellip;
            <input value={plan.cue} maxLength={180} placeholder="pour my morning coffee" disabled={saving} onChange={field('cue')}
              data-step-focus {...(editing ? { 'data-autofocus': true } : {})} /></label>
          <div className="chip-row" role="group" aria-label="Common moments to follow">
            {choices.map(item => <button key={item} type="button" disabled={saving} className={`chip ${plan.cue === item ? 'selected' : ''}`}
              onClick={() => setPlan(current => ({ ...current, cue: item }))}>{item}</button>)}
          </div>
        </>}
        <div className="field-pair">
          <label className="field">Time<input type="time" value={plan.time} disabled={saving} onChange={field('time')}
            {...(!repeating ? { 'data-step-focus': true } : {})} {...(editing && !repeating ? { 'data-autofocus': true } : {})} /></label>
          <label className="field">Place<input value={plan.place} maxLength={80} placeholder="Kitchen table" disabled={saving} onChange={field('place')} /></label>
        </div>
        <p className="group-note">{repeating ? 'Attach it to something you already do every day. A reliable moment works better than a reminder.'
          : 'Decide when and where. A clear time and place makes starting easier.'}</p>
      </section>}

      {guided && step === 2 && easy}

      {shownStep(3) && <section className="sheet-group" aria-labelledby="law-attractive">
        <h3 id="law-attractive"><span className="law">2</span>Make it attractive</h3>
        <div className="field">
          <span id="points-label">{kind === 'timed' ? 'Points per minute' : 'Points when done'}</span>
          <div className="chip-row" role="group" aria-labelledby="points-label">
            {(kind === 'timed' ? [1, 1.5, 2] : [1, 3, 5, 10]).map(value => <button key={value} type="button" disabled={saving}
              className={`chip ${Number(pointsText) === value ? 'selected' : ''}`}
              onClick={() => (kind === 'timed' ? setMinutePoints : setDonePoints)(String(value))}>{value}</button>)}
            <input type="number" aria-labelledby="points-label" min="0" max="1000" step=".01" required value={pointsText} disabled={saving}
              onChange={event => (kind === 'timed' ? setMinutePoints : setDonePoints)(event.target.value)} />
          </div>
        </div>
        {repeating && <label className="field">Only while doing this, I get to&hellip;
          <input value={plan.bundle} maxLength={180} placeholder="listen to my favorite podcast" disabled={saving} onChange={field('bundle')}
            data-step-focus /></label>}
        {reward && <p className="reward-hint">Working toward <strong>{reward.title}</strong>
          {reward.remaining > 0 ? ` · ${points(reward.remaining)} points to go` : ' · ready to redeem'}</p>}
        <p className="group-note">Keep something you enjoy for this habit only, and let points build toward a reward you chose.</p>
      </section>}

      {!guided && easy}

      {shownStep(3) && repeating && <section className="sheet-group" aria-labelledby="law-satisfying">
        <h3 id="law-satisfying"><span className="law">4</span>Make it satisfying</h3>
        <label className="field">Who this makes you
          <input value={plan.identity} maxLength={120} placeholder="I am a reader" disabled={saving} onChange={field('identity')} /></label>
        <p className="group-note">Finishing gives points and grows your chain right away. Each time counts as a vote for this identity.</p>
      </section>}

      {shownStep(3) && <section className="sheet-preview" aria-label="Plan summary">
        <p className="preview-title">{subject ? '“' + subject + '”' : 'Your plan'}</p>
        {cueLine({ ...plan, cue: repeating ? plan.cue : '' }) && <p>{cueLine({ ...plan, cue: repeating ? plan.cue : '' })}</p>}
        <p>{[schedule, scoreText, kind === 'timed' ? (target || '?') + ' min target' : ''].filter(Boolean).join(' · ')}</p>
        {plan.starter && <p>Start with: {plan.starter}</p>}
        {repeating && plan.identity && <p>Vote for: {plan.identity}</p>}
      </section>}
    </div>
    <footer className="sheet-footer">
      {error && <p role="alert" className="error">{error}</p>}
      {guided && step > 0
        ? <button type="button" className="secondary-button" disabled={saving} onClick={() => setStep(step - 1)}>Back</button>
        : <button type="button" className="secondary-button" disabled={saving} onClick={onClose}>Cancel</button>}
      {guided && step < steps.length - 1
        ? <button type="submit" className="primary" disabled={saving || (step === 0 && basicsMissing)}>{step === 0 ? 'Next' : 'Next (or skip)'}</button>
        : <button type="submit" className="primary" disabled={blocked}>
          {saving ? 'Saving...' : editing ? 'Save plan' : guided || kind === 'timed' ? 'Add habit' : 'Add task'}</button>}
    </footer>
  </form>;
}
