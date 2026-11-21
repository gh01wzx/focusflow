import { FREQUENCIES, HABIT_FREQUENCIES, isHabit, monthsBetween, SCHEDULE_LEAD_DAYS } from '../../../src/shared/tasks.ts';
import { addDays } from '../../../src/shared/calendar.ts';
import { t } from '../../workspace/locale.ts';
import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { emptyPlan, points } from '../../../src/shared/personal.ts';
import type { HabitPlan, ScoringRule } from '../../../src/shared/personal.ts';
import type { Frequency, RecurrenceRule, Task, TaskDraft, Weekday } from '../../../src/shared/tasks.ts';
import { WEEKDAYS } from '../../../src/shared/weekdays.ts';
import { HABIT_LIMIT, cueLine, tiersOf } from '../../../src/shared/habits.ts';
import { dateText, frequencyLabels } from '../view-options.ts';
import { WeekdayPicker } from './WeekdayPicker.tsx';
import { CloseIcon, PencilIcon } from './Icons.tsx';

type Kind = 'once' | 'repeat' | 'checkoff';
// A guided request walks through a new habit one question at a time. A cue starts the
// "After I" field, for example when stacking a new habit after a steady one.
export type SheetRequest = { mode: 'create'; id: string; guided?: boolean; title?: string; cue?: string }
  | { mode: 'edit'; id: string; task: Task | undefined; series: RecurrenceRule | undefined; effective: string; rule: ScoringRule | undefined };
export interface PlanUpdate extends HabitPlan { category: 'task' | 'habit'; mode: 'minutes' | 'complete'; unit?: 'minutes' | 'count'; rate: number; target: number; schedule?: { frequency: Frequency; weekdays: Weekday[] | null; date: string; previous: string; flexible?: boolean }; title?: string; start?: number | null; maintain?: number | null; goalId?: string | null; timesPerWeek?: number | null }

interface SheetProps {
  request: SheetRequest | null;
  today: string;
  busy: boolean;
  reward: { title: string; remaining: number } | null;
  // Moments the user already relies on, offered as one-tap cues.
  anchors: string[];
  identities: string[];
  // Repeating habits already scheduled, for a gentle note when adding more than a few.
  habits: number;
  // Open quarterly goals a plan can work toward.
  goals: { id: string; title: string }[];
  // Each returns an error message, or an empty string after saving.
  onCreate(draft: TaskDraft): Promise<string>;
  onRemove(id: string, scope: 'plan' | 'occurrence'): Promise<string>;
  onSavePlan(id: string, update: PlanUpdate): Promise<string>;
  onClose(): void;
}

const kinds: { value: Kind; label: string; hint: string }[] = [
  { value: 'once', label: 'One-off', hint: 'Done once on a planned date.' },
  { value: 'repeat', label: 'Repeating task', hint: 'Repeats daily, on chosen weekdays, or monthly, quarterly or yearly.' },
  { value: 'checkoff', label: 'Habit', hint: 'Build consistency with a daily goal.' },
];
const steps = ['What and when', 'Make it obvious', 'Make it easy', 'Make it satisfying'];
// The plan summary for each schedule except weekly, which lists its weekdays.
const scheduleFrom: Record<Exclude<Frequency, 'weekly'>, string> = {
  daily: 'Daily from ', monthly: 'Monthly from ', quarterly: 'Every three months from ', yearly: 'Yearly from ',
};

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

function SheetForm({ request, today, busy, reward, anchors, identities, habits, goals, onCreate, onSavePlan, onRemove, onClose }: SheetProps & { request: SheetRequest }) {
  const editing = request.mode === 'edit' ? request : null;
  const guided = request.mode === 'create' && !!request.guided;
  const rule = editing?.rule;
  const series = editing?.series;
  const task = editing?.task;
  const historyOnly = !!editing && !series && (task?.status !== 'pending' || !!task.recurrenceId);
  const initialDate = editing?.effective ?? today;
  const [deletion, setDeletion] = useState<'plan' | 'occurrence' | null>(null);
  const form = useRef<HTMLFormElement>(null);
  const [step, setStep] = useState(0);
  const [kind, setKind] = useState<Kind>(guided ? 'checkoff' : !editing ? 'once'
    : !series ? 'once' : isHabit(series) ? 'checkoff' : 'repeat');
  // A saved plan keeps its name until the pencil beside it is chosen.
  const original = series?.title ?? task?.title ?? '';
  const [title, setTitle] = useState(request.mode === 'create' ? request.title ?? '' : original);
  const [renaming, setRenaming] = useState(false);
  const renamed = !!editing && title.trim() !== original;
  const [date, setDate] = useState(initialDate);
  const [frequency, setFrequency] = useState<Frequency>(series?.frequency ?? 'daily');
  const [weekdays, setWeekdays] = useState<Weekday[]>(series?.weekdays ?? []);
  // A month-based schedule set aside while Habit is chosen, restored on switching back.
  const [setAside, setSetAside] = useState<Frequency | null>(null);
  // Number fields keep their typed text, so clearing one does not snap it back to zero.
  const [donePoints, setDonePoints] = useState(rule?.mode === 'complete' ? String(rule.rate / 100) : '5');
  const [minutePoints, setMinutePoints] = useState(rule ? String(rule.rate / 100) : '1');
  const [target, setTarget] = useState(rule?.mode === 'minutes' ? String(rule.target) : '1');
  // A habit's check-in and maintain amounts. Empty uses the defaults shown as placeholders.
  const [start, setStart] = useState(rule?.start ? String(rule.start) : '');
  const [maintain, setMaintain] = useState(rule?.maintain ? String(rule.maintain) : '');
  // A link to a goal that has since closed is not offered again.
  const [goalId, setGoalId] = useState(rule?.goalId && goals.some(goal => goal.id === rule.goalId) ? rule.goalId : '');
  const [plan, setPlan] = useState<HabitPlan>(request.mode === 'create' && request.cue ? { ...emptyPlan, cue: request.cue } : planOf(rule));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const category = kind === 'checkoff' ? 'habit' : 'task';
  const [unit, setUnit] = useState<'minutes' | 'count'>(rule?.mode === 'minutes' ? rule.unit ?? 'minutes' : 'count');
  const repeating = kind !== 'once';
  // Plans made before counts existed are checked off once per occurrence. Editing keeps that,
  // so saving a cue or time never changes how the habit is recorded.
  const checkOff = !!series && rule?.mode === 'complete';
  const counted = repeating && !checkOff;
  const tiered = counted && category === 'habit';
  const defaults = tiersOf({ target: Number(target) || 1, unit, start: null, maintain: null });
  const pointsText = counted ? minutePoints : donePoints;
  const field = (key: keyof HabitPlan) => (event: ChangeEvent<HTMLInputElement>) =>
    setPlan(current => ({ ...current, [key]: event.target.value }));
  // Seven-day periods without weekdays are either a flexible habit (some days a week, any days) or
  // an older schedule that repeats every seven days.
  const anyDays = series?.frequency === 'weekly' && series.weekdays === null;
  const [legacyWeekly, setLegacyWeekly] = useState(anyDays && !rule?.timesPerWeek);
  const [flexible, setFlexible] = useState(anyDays && !!rule?.timesPerWeek);
  const [times, setTimes] = useState(rule?.timesPerWeek ? String(rule.timesPerWeek) : '3');
  const days = frequency === 'weekly' && !legacyWeekly && !flexible ? weekdays : null;
  const changedSchedule = series && (date !== initialDate || frequency !== series.frequency ||
    JSON.stringify(days) !== JSON.stringify(series.weekdays));
  const basicsMissing = ((!editing || !!series) && (!date || (repeating && date < today))) || !title.trim() || (!!days && !days.length) || (flexible && !(Number(times) >= 1 && Number(times) <= 7));
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
    if (blocked || deletion || historyOnly) return;
    setSaving(true); setError('');
    // Fields hidden for the chosen kind are saved empty.
    const shown: HabitPlan = category === 'habit' ? plan : { ...emptyPlan, time: plan.time, place: plan.place };
    const rate = Math.round(Number(pointsText) * 100);
    const minutes = counted ? Number(target) : 0;
    const tierAmounts = tiered ? { start: start ? Number(start) : null, maintain: maintain ? Number(maintain) : null } : {};
    const failure = editing
      ? await onSavePlan(series?.id ?? task!.id, { ...shown, category,
          ...(changedSchedule ? { schedule: { date, frequency, weekdays: days, previous: JSON.stringify([series.frequency, series.weekdays, series.nextDate]), ...(flexible ? { flexible: true } : {}) } } : {}),
          ...(tiered ? { timesPerWeek: flexible ? Number(times) : null } : {}),
          ...(renamed ? { title: title.trim() } : {}), ...tierAmounts, goalId: goalId || null, mode: counted ? 'minutes' : 'complete', unit, rate, target: minutes })
      : await onCreate({ category, title, plannedDate: date, frequency: repeating ? frequency : 'none', mode: repeating ? 'minutes' : 'complete', unit,
        ...(repeating && frequency === 'weekly' ? flexible ? { flexible: true } : { weekdays } : {}),
        plan: { ...shown, ...tierAmounts, goalId: goalId || null, ...(flexible ? { timesPerWeek: Number(times) } : {}), rate, target: minutes } });
    setSaving(false);
    if (failure) setError(failure); else onClose();
  }

  const subject = title.trim() || original;
  const formattedDate = date ? dateText(date) : '';
  const monthly = repeating && monthsBetween(frequency) !== null;
  const schedule = !repeating ? formattedDate
      : frequency !== 'weekly' ? t(scheduleFrom[frequency]) + formattedDate
        : flexible ? t('{0} days a week, from ', times) + formattedDate
        : legacyWeekly ? t('Every 7 days from the first date (existing schedule)') + ' ' + formattedDate
        : (weekdays.length ? WEEKDAYS.filter(day => weekdays.includes(day.value)).map(day => t(day.label)).join(', ') : t('Choose weekdays')) + t(' from ') + formattedDate;
  const scoreText = counted ? points(Math.round(Number(minutePoints) * 100)) + t(unit === 'count' ? ' pt/count' : ' pt/min') : '+' + points(Math.round(Number(donePoints) * 100)) + t(' points');
  const choices = [...new Set([...anchors, ...['wake up', 'pour my morning coffee', 'sit down at my desk', 'finish lunch',
    'get home', 'finish dinner', 'get into bed'].map(item => t(item))].map(item => item.trim()).filter(Boolean))].slice(0, 8);
  const easy = <section className="sheet-group" aria-labelledby="law-easy">
    <h3 id="law-easy"><span className="law">3</span>{t("Make it easy")}</h3>
    <label className="field">{t("Two-minute version")}
      <input value={plan.starter} maxLength={180} placeholder={repeating ? t('Put on my running shoes') : t('Open the file and write one line')}
        disabled={saving} onChange={field('starter')} data-step-focus /></label>
    <p className="group-note">{t("Start smaller than feels useful. Doing only the two-minute version still counts as showing up.")}</p>
  </section>;

  return <form ref={form} className="sheet-form" onSubmit={event => void submit(event)}>
    <header className="sheet-header">
      <div>
        <h2 id="sheet-title">{editing ? t('Edit plan') : category === 'habit' ? t('New habit') : t('New task')}</h2>
        {guided && <p className="step-label" aria-live="polite">{t("Step {0} of {1}", step + 1, steps.length)} &middot; {t(steps[step] ?? '')}</p>}
      </div>
      <button type="button" className="icon-button" aria-label={t("Close")} disabled={saving} onClick={onClose}><CloseIcon /></button>
    </header>
    {guided && <ol className="step-dots" aria-hidden="true">{steps.map((name, index) =>
      <li key={name} className={index === step ? 'current' : index < step ? 'past' : ''} />)}</ol>}
    <div className="sheet-body">
      {historyOnly ? <p className="sheet-subject">{subject} · {dateText(task!.plannedDate)}</p> : <>
      {shownStep(0) && <>
        <fieldset className="segmented" disabled={saving}>
          <legend className="sr-only">{t("Kind")}</legend>
          {kinds.filter(item => {
            if (editing) return series ? item.value !== 'once' : item.value === 'once';
            return guided ? item.value === 'checkoff' : item.value === 'once' || item.value === 'repeat';
          }).map(item => {
            return <label key={item.value} className={kind === item.value ? 'selected' : ''} title={t(item.hint)}>
              <input type="radio" name="kind" value={item.value} checked={kind === item.value}
                onChange={() => {
                  setKind(item.value);
                  // Habits repeat daily or weekly, so a month-based schedule waits as daily until
                  // Repeating task is chosen again.
                  if (item.value === 'checkoff' && !HABIT_FREQUENCIES.includes(frequency)) { setSetAside(frequency); setFrequency('daily'); }
                  else if (item.value === 'repeat' && setAside) { if (frequency === 'daily') setFrequency(setAside); setSetAside(null); }
                  // Only habits repeat on any days of the week.
                  if (item.value !== 'checkoff') setFlexible(false);
                }} />{t(item.label)}
            </label>;
          })}
        </fieldset>
        <p className="kind-hint">{t(kinds.find(item => item.value === kind)!.hint)}</p>

        <section className="sheet-group">
          {editing && !renaming ? <div className="sheet-title-row"><p className="sheet-subject">{subject}</p>
            <button type="button" className="icon-button" aria-label={t("Rename {0}", subject)} title={t("Rename")} disabled={saving}
              onClick={() => setRenaming(true)}><PencilIcon /></button></div> :
            <input className="title-input" aria-label={t(guided || category === 'habit' ? 'Habit title' : 'Task title')} value={title} maxLength={300} required
              data-autofocus={!editing || undefined} autoFocus={renaming} autoComplete="off"
              placeholder={guided || category === 'habit' ? t('What habit do you want to build?') : t('What will you do?')}
              disabled={saving} onChange={event => setTitle(event.target.value)} />}
          {(!editing || series) &&
          <div className="field-row">
            <label htmlFor="sheet-date">{series ? t('Schedule from') : repeating ? t('Start date') : t('Planned date')}</label>
            <input id="sheet-date" aria-label={t(series ? "Schedule from" : "Planned date")} type="date" value={date} required disabled={saving}
              min={repeating ? today : undefined} max={series ? addDays(today, SCHEDULE_LEAD_DAYS) : undefined}
              onChange={event => setDate(event.target.value)} />
          </div>}
          {repeating && <div className="field-row">
            <label htmlFor="sheet-repeat">{t("Repeat")}</label>
            <select id="sheet-repeat" value={legacyWeekly ? 'legacy' : flexible ? 'flexible' : frequency} disabled={saving}
              onChange={event => { const value = event.target.value; setLegacyWeekly(value === 'legacy'); setFlexible(value === 'flexible');
                setFrequency(value === 'legacy' || value === 'flexible' ? 'weekly' : value as Frequency); }}>
              {series?.frequency === 'weekly' && series.weekdays === null && <option value="legacy">{t('Every 7 days from the first date (existing schedule)')}</option>}
              {(category === 'habit' ? HABIT_FREQUENCIES : FREQUENCIES).map(item => <option key={item} value={item}>{t(frequencyLabels[item])}</option>)}
              {category === 'habit' && counted && <option value="flexible">{t("Some days a week, any days")}</option>}
            </select>
          </div>}
          {flexible && <div className="field-row">
            <label htmlFor="sheet-times">{t("Days a week")}</label>
            <input id="sheet-times" type="number" min="1" max="7" step="1" required value={times} disabled={saving}
              onChange={event => setTimes(event.target.value)} />
          </div>}
          {flexible && <p className="group-note">{t("Each seven-day period from the start date needs this many days with a check-in, on any days.")}</p>}
          {goals.length > 0 && <div className="field-row">
            <label htmlFor="sheet-goal">{t("Goal")}</label>
            <select id="sheet-goal" value={goalId} disabled={saving} onChange={event => setGoalId(event.target.value)}>
              <option value="">{t("No goal")}</option>
              {goals.map(goal => <option key={goal.id} value={goal.id}>{goal.title}</option>)}
            </select>
          </div>}
          {monthly && Number(date.slice(8, 10)) > 28 && <p className="group-note">{t("In months without this day, it falls on the last day of the month.")}</p>}
          {repeating && frequency === 'weekly' && !legacyWeekly && !flexible && <WeekdayPicker selected={weekdays} disabled={saving} onChange={setWeekdays} />}
          {series && <p className="group-note">{t("The new schedule starts on this date, up to four weeks ahead. Until then the current schedule continues. Recorded activity keeps its original dates.")}</p>}
          {checkOff && <p className="group-note">{t("Checked off once each time it comes up. This plan keeps that way of recording.")}</p>}
          {counted && <div className="field-pair">
            <label className="field">{t("Record by")}<select value={unit} disabled={saving}
              onChange={event => setUnit(event.target.value as 'minutes' | 'count')}>
              <option value="count">{t("Counts")}</option><option value="minutes">{t("Minutes")}</option>
            </select></label>
            <label className="field">{t(monthly ? (unit === 'count' ? "Target each time in counts" : "Target each time in minutes")
              : unit === 'count' ? "Daily target in counts" : "Daily target in minutes")}
              <input type="number" min="1" max="1440" step="1" required value={target} disabled={saving}
                onChange={event => setTarget(event.target.value)} /></label>
          </div>}
          {tiered && <><div className="field-pair">
            <label className="field">{t(unit === 'count' ? "Check-in in counts" : "Check-in in minutes")}
              <input type="number" min="1" max="1440" step="1" value={start} placeholder={String(defaults.start)} disabled={saving}
                onChange={event => setStart(event.target.value)} /></label>
            <label className="field">{t(unit === 'count' ? "Maintain in counts" : "Maintain in minutes")}
              <input type="number" min="1" max="1440" step="1" value={maintain} placeholder={String(defaults.maintain)} disabled={saving}
                onChange={event => setMaintain(event.target.value)} /></label>
          </div>
          <p className="group-note">{t("Each day starts with the check-in, an easy version even on a busy day. Then maintain, then the goal. Leave a field empty for its default.")}</p></>}
        </section>
        {!editing && category === 'habit' && habits >= HABIT_LIMIT && <p className="soft-note">{t("You are already building {0} habits. New habits stick better one at a time, so you might add this one when another feels easy.", habits)}</p>}
      </>}

      {shownStep(1) && <section className="sheet-group" aria-labelledby="law-obvious">
        {category === 'habit' && <h3 id="law-obvious"><span className="law">1</span>{t("Make it obvious")}</h3>}
        {category === 'habit' && <>
          <label className="field">{t("After I…")}
            <input value={plan.cue} maxLength={180} placeholder={t("pour my morning coffee")} disabled={saving} onChange={field('cue')}
              data-step-focus {...(editing ? { 'data-autofocus': true } : {})} /></label>
          <div className="chip-row" role="group" aria-label={t("Common moments to follow")}>
            {choices.map(item => <button key={item} type="button" disabled={saving} className={`chip ${plan.cue === item ? 'selected' : ''}`}
              onClick={() => setPlan(current => ({ ...current, cue: item }))}>{item}</button>)}
          </div>
        </>}
        <div className="field-pair">
          <label className="field">{t("Time")}<input type="time" value={plan.time} disabled={saving} onChange={field('time')}
            {...(!repeating ? { 'data-step-focus': true } : {})} {...(editing && !repeating ? { 'data-autofocus': true } : {})} /></label>
          <label className="field">{t("Place")}<input value={plan.place} maxLength={80} placeholder={t("Kitchen table")} disabled={saving} onChange={field('place')} /></label>
        </div>
        <p className="group-note">{category === 'habit' ? t('Attach it to something you already do every day. A reliable moment works better than a reminder.')
          : t('Decide when and where. A clear time and place makes starting easier.')}</p>
      </section>}

      {guided && step === 2 && easy}

      {shownStep(3) && <section className="sheet-group" aria-labelledby="law-attractive">
        {category === 'habit' && <h3 id="law-attractive"><span className="law">2</span>{t("Make it attractive")}</h3>}
        <div className="field">
          <span id="points-label">{counted ? t(unit === 'count' ? 'Points per count' : 'Points per minute') : t('Points when done')}</span>
          <div className="chip-row" role="group" aria-labelledby="points-label">
            {(counted ? [1, 1.5, 2] : [1, 3, 5, 10]).map(value => <button key={value} type="button" disabled={saving}
              className={`chip ${Number(pointsText) === value ? 'selected' : ''}`}
              onClick={() => (counted ? setMinutePoints : setDonePoints)(String(value))}>{value}</button>)}
            <input type="number" aria-labelledby="points-label" min="0" max="1000" step=".01" required value={pointsText} disabled={saving}
              onChange={event => (counted ? setMinutePoints : setDonePoints)(event.target.value)} />
          </div>
        </div>
        {category === 'habit' && <label className="field">{t("Only while doing this, I get to…")}
          <input value={plan.bundle} maxLength={180} placeholder={t("listen to my favorite podcast")} disabled={saving} onChange={field('bundle')}
            data-step-focus /></label>}
        {reward && <p className="reward-hint">{t("Working toward")} <strong>{reward.title}</strong>
          {reward.remaining > 0 ? t(" · {0} points to go", points(reward.remaining)) : t(' · ready to redeem')}</p>}
        {category === 'habit' && <p className="group-note">{t("Keep something you enjoy for this habit only, and let points build toward a reward you chose.")}</p>}
      </section>}

      {!guided && category === 'habit' && easy}

      {shownStep(3) && category === 'habit' && <section className="sheet-group" aria-labelledby="law-satisfying">
        <h3 id="law-satisfying"><span className="law">4</span>{t("Make it satisfying")}</h3>
        <label className="field">{t("Who this makes you")}
          <input value={plan.identity} maxLength={120} placeholder={t("I am a reader")} disabled={saving} onChange={field('identity')} /></label>
        {identities.length > 0 && <label className="field">{t("Use a saved identity")}
          <select disabled={saving} value={identities.includes(plan.identity) ? plan.identity : ''}
            onChange={e => setPlan(current => ({ ...current, identity: e.target.value }))}>
            <option value="" disabled>{t("Choose an identity")}</option>
            {identities.map(identity => <option key={identity} value={identity}>{identity}</option>)}
          </select>
        </label>}
        <p className="group-note">{category === 'habit' ? t("Finishing gives points and grows your chain right away. Each time counts as a vote for this identity.")
          : t("Completing this task adds one vote for this identity.")}</p>
      </section>}

      {shownStep(3) && <section className="sheet-preview" aria-label={t("Plan summary")}>
        <p className="preview-title">{subject ? '“' + subject + '”' : t('Your plan')}</p>
        {cueLine(category === 'habit' ? plan : { ...emptyPlan, time: plan.time, place: plan.place }) && <p>{cueLine(category === 'habit' ? plan : { ...emptyPlan, time: plan.time, place: plan.place })}</p>}
        <p>{[schedule, scoreText, counted ? t(unit === 'count' ? '{0} counts per day' : '{0} minutes per day', target || '?') : ''].filter(Boolean).join(' · ')}</p>
        {category === 'habit' && plan.starter && <p>{t("Start with:")} {plan.starter}</p>}
        {category === 'habit' && plan.identity && <p>{t("Vote for:")} {plan.identity}</p>}
      </section>}
      </>}
    </div>
    <footer className="sheet-footer">
      {error && <p role="alert" className="error">{t(error)}</p>}
      {deletion ? <div className="delete-confirm">
        <p>{t(deletion === 'plan' ? 'Delete this plan and its open occurrences? Past records and points will stay.' :
          task?.recurrenceId ? 'Delete this occurrence from your lists? Recorded points and other dates will stay.' : 'Delete this task? Recorded points will stay.')}</p>
        <button type="button" className="secondary-button" disabled={saving} onClick={() => setDeletion(null)}>{t("Back")}</button>
        <button type="button" className="danger-button" disabled={saving || busy} onClick={async () => {
          setSaving(true); setError('');
          const failure = await onRemove(deletion === 'plan' ? series!.id : task!.id, deletion);
          setSaving(false); if (failure) setError(failure); else onClose();
        }}>{t("Confirm deletion")}</button>
      </div> : <>
      {editing && <div className="sheet-delete-actions">
        {task && <button type="button" className="text-button danger-text" disabled={saving || busy}
          onClick={() => setDeletion('occurrence')}>{t(task.recurrenceId ? "Delete this occurrence" : "Delete task")}</button>}
        {series && <button type="button" className="text-button danger-text" disabled={saving || busy}
          onClick={() => setDeletion('plan')}>{t("Delete plan")}</button>}
      </div>}
      {guided && step > 0
        ? <button type="button" className="secondary-button" disabled={saving} onClick={() => setStep(step - 1)}>{t("Back")}</button>
        : <button type="button" className="secondary-button" disabled={saving} onClick={onClose}>{t("Cancel")}</button>}
      {guided && step < steps.length - 1
        ? <button type="submit" className="primary" disabled={saving || (step === 0 && basicsMissing)}>{step === 0 ? t('Next') : t('Next (or skip)')}</button>
        : !historyOnly && <button type="submit" className="primary" disabled={blocked}>
          {saving ? t('Saving...') : editing ? t('Save plan') : category === 'habit' ? t('Add habit') : t('Add task')}</button>}
      </>}
    </footer>
  </form>;
}
