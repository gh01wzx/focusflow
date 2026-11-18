import { InterfaceContext } from '../workspace/interface-context.ts';
import { defaultInterface } from '../../src/shared/interface.ts';
import { t } from '../workspace/locale.ts';
import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, MotionConfig } from 'motion/react';
import { usePersonal } from './usePersonal.ts';
import { ActivityHistory, RewardShop } from './components/PersonalRewards.tsx';
import type { ScoringRule } from '../../src/shared/personal.ts';
import { isHabit, FOCUS_LIMIT, HISTORY_LIMIT } from '../../src/shared/tasks.ts';
import type { RecurrenceRule, Task } from '../../src/shared/tasks.ts';
import { doneToday, fullDaysBefore, habitInsight, identityKey, nextUp, reviewHabits, todayProgress } from '../../src/shared/habits.ts';
import type { HabitReview } from '../../src/shared/habits.ts';
import { WorkspaceShell } from '../workspace/WorkspaceShell.tsx';
import type { WorkspaceProps } from '../workspace/WorkspaceShell.tsx';
import { useTodayController } from './useTodayController.ts';
import { canReopen, labels, tabText } from './view-options.ts';
import { TaskRow } from './components/TaskRow.tsx';
import { HabitCard } from './components/HabitCard.tsx';
import { TaskSheet } from './components/TaskSheet.tsx';
import type { SheetRequest } from './components/TaskSheet.tsx';
import { ProgressPanel } from './components/ProgressPanel.tsx';
import { NowCard } from './components/NowCard.tsx';
import { QuickAdd } from './components/QuickAdd.tsx';
import { CloseDaySheet, EVENING, EveningPrompt } from './components/CloseDaySheet.tsx';
import { PAGE, ShowMore } from './components/ShowMore.tsx';
import { Celebration } from './components/Celebration.tsx';
import type { Moment } from './components/Celebration.tsx';
import { WeeklyReview, WeekPrompt, weekOf } from './components/WeeklyReview.tsx';
import { ListItem } from './components/Animated.tsx';
import { CheckIcon, PlusIcon, SparkIcon } from './components/Icons.tsx';
import { FoldCard } from './components/FoldCard.tsx';
import { readClosed, readFolded, readReviewed, readTimer, writeClosed, writeFolded, writeReviewed, writeTimer } from './local-state.ts';
import type { Timer } from './local-state.ts';
import { reportInterfaceReady } from '../../src/client/build.ts';

export function TodayApp({ onWorkspaceChange }: WorkspaceProps) {
  const state = useTodayController();
  const { view, tab, setTab, busy, error, message, undo, refresh } = state;
  const settings = useContext(InterfaceContext)?.settings ?? defaultInterface;
  const personal = usePersonal(view, refresh, settings);
  const [rewards, setRewards] = useState(false);
  const [sheet, setSheet] = useState<SheetRequest | null>(null);
  const [timer, setTimerState] = useState<Timer | null>(readTimer);
  const [closing, setClosing] = useState(false);
  const [closedDay, setClosedDay] = useState(readClosed);
  const [reviewing, setReviewing] = useState(false);
  const [reviewedWeek, setReviewedWeek] = useState(readReviewed);
  // Cards folded or opened with a click, by view and card.
  const [folded, setFolded] = useState(readFolded);
  const isFolded = (key: string, initially = false) => folded[key] ?? initially;
  function toggleCard(key: string, initially = false) {
    const next = { ...folded, [key]: !isFolded(key, initially) };
    setFolded(next); writeFolded(next);
  }
  const reduced = settings.reducedMotion || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Upcoming and History show a page per group at first; Today always shows everything.
  const [limits, setLimits] = useState<Record<string, number>>({});
  // A minute clock keeps the timer cards in step with planned times.
  const [minute, setMinute] = useState(() => new Date().toTimeString().slice(0, 5));
  const saving = busy || personal.busy;
  const data = personal.data;
  // The first screen waits for points as well as tasks, so habit cards and the timer card never
  // slide the lists into place after the window opens. Slow or failed points hold back usable
  // tasks for two seconds at most.
  const [pointsLate, setPointsLate] = useState(false);
  const pointsReady = !!data || !!personal.error || pointsLate;
  useEffect(() => {
    if (!view || pointsReady) return;
    const timer = setTimeout(() => setPointsLate(true), 2000);
    return () => clearTimeout(timer);
  }, [!!view, pointsReady]);
  // The desktop window opens once this first screen is complete.
  const readyReported = useRef(false);
  useEffect(() => {
    if (!view || !pointsReady || readyReported.current) return;
    readyReported.current = true;
    void reportInterfaceReady().catch(() => { readyReported.current = false; });
  }, [view, pointsReady]);
  const today = view?.today ?? '';
  const rules = useMemo(() => new Map<string, ScoringRule>(data?.rules.map(rule => [rule.subject, rule])), [data]);
  const ruleFor = (task: Task) => rules.get(task.recurrenceId ?? task.id);
  const completedToday = useMemo(() => view?.history.filter(task => doneToday(task, view.today, view.recurrences)) ?? [], [view]);
  const progress = view ? todayProgress(view, rules, data?.progress ?? {}, completedToday) : null;
  // Each habit's past occurrences, grouped once per view instead of scanning all history for every row.
  const historyByHabit = useMemo(() => {
    const groups = new Map<string, Task[]>();
    for (const item of view?.history ?? []) {
      if (!item.recurrenceId) continue;
      const list = groups.get(item.recurrenceId);
      if (list) list.push(item); else groups.set(item.recurrenceId, [item]);
    }
    return groups;
  }, [view]);
  // Each habit finished today gets a quiet moment that grows as the day fills. Only increases
  // after the page has loaded count, so opening the app or undoing never celebrates.
  const [moment, setMoment] = useState<Moment | null>(null);
  const seen = useRef<{ day: string; done: number } | null>(null);
  const habitsDone = data && progress ? progress.habits.done : null;
  useEffect(() => {
    if (habitsDone === null || !view || !data || !progress) return;
    const last = seen.current;
    seen.current = { day: view.today, done: habitsDone };
    if (!last || last.day !== view.today || habitsDone <= last.done || !progress.habits.total) return;
    const habitIds = view.recurrences.filter(isHabit).map(rule => rule.id);
    setMoment({ id: Date.now(), done: habitsDone, total: progress.habits.total, streak: fullDaysBefore(view.today, habitIds, data.recent) });
  }, [habitsDone, view?.today]);
  const pinned = data?.rewards.find(item => item.id === data.preferences.pinnedReward);
  const rows = view?.[tab] ?? [];
  const due = view?.due ?? [];
  const focusIds = view?.focus.today ?? [];
  const focusOpen = focusIds.flatMap(id => due.filter(task => task.id === id));
  const focusDone = completedToday.filter(task => focusIds.includes(task.id)).length;
  // Focus places held by tasks still open or done today. A dropped or moved task frees its place.
  const liveFocus = focusIds.filter(id => due.some(task => task.id === id) || completedToday.some(task => task.id === id));
  const groups = [
    ...(tab === 'due' ? [{ key: 'focus', title: 'Focus', items: focusOpen }] : []),
    { key: 'habits', title: 'Habits', items: rows.filter(isHabit) },
    { key: 'tasks', title: tab === 'due' && focusOpen.length ? 'Other tasks' : 'Tasks', items: rows.filter(task => !isHabit(task) && (tab !== 'due' || !focusIds.includes(task.id))) },
  ];
  const text = tabText[tab];
  // The swipeable timer cards: today's timed habits still below their target.
  const timers = (view && data ? nextUp(view.due, rules, data.progress, minute) : []).filter(task => { const rule = ruleFor(task); return rule?.mode === 'minutes' && rule.unit !== 'count'; });
  const anchors = useMemo(() => [...new Set((data?.rules ?? []).map(rule => rule.cue).filter(Boolean))], [data]);
  const reviews = useMemo(() => view && data ? reviewHabits(view.today, view.recurrences, rules, data.recent) : [], [view, data, rules]);
  const week = today ? weekOf(today) : '';
  // The weekly prompt waits until at least one habit has enough days to say something useful.
  const reviewDue = reviewedWeek !== week && reviews.some(review => review.suggestion.kind !== 'new');

  useEffect(() => {
    const id = setInterval(() => setMinute(new Date().toTimeString().slice(0, 5)), 60_000);
    return () => clearInterval(id);
  }, []);

  function openEditor(task: Task | undefined, series: RecurrenceRule | undefined) {
    const subject = series?.id ?? task?.recurrenceId ?? task?.id;
    if (!subject) return;
    const pending = series && [...(view?.due ?? []), ...(view?.upcoming ?? [])].find(item => item.recurrenceId === series.id);
    const date = pending?.plannedDate ?? series?.nextDate ?? task?.plannedDate ?? today;
    setSheet({ mode: 'edit', id: crypto.randomUUID(), task, series, effective: series && date < today ? today : date, rule: rules.get(subject) });
  }
  const edit = (task: Task) => openEditor(task, view?.recurrences.find(series => series.id === task.recurrenceId));
  const editSeries = (series: RecurrenceRule) => openEditor(undefined, series);
  const votesFor = (rule: ScoringRule | undefined) => rule?.identity ? data?.votes[identityKey(rule.identity)] ?? 0 : 0;
  // Doing or starting a habit is a vote for the identity it supports. More minutes on the same day
  // add to the log, not to the votes. The count comes from before the save, plus this vote.
  const vote = (task: Task, counted = true) => {
    const rule = ruleFor(task);
    if (!rule?.identity || !counted) return '';
    const count = votesFor(rule) + 1;
    return count === 1 ? t(" Your first vote for “{0}”.", rule.identity) : t(" That makes {0} votes for “{1}”.", count, rule.identity);
  };
  async function complete(task: Task) {
    const saved = await personal.resolve(task, 'completed', state.resolve);
    if (saved && vote(task)) state.announce(t(isHabit(task) ? 'Habit completed.' : 'Task completed.') + vote(task));
    return saved;
  }
  async function log(task: Task, minutes: number) {
    if (!data) return false;
    const first = (data.progress[task.id] ?? 0) === 0;
    const saved = await personal.mutate('log', { id: crypto.randomUUID(), day: data.day, subject: task.id, minutes, unit: ruleFor(task)?.unit }, ruleFor(task)?.target);
    if (saved) logged(task, minutes, first);
    return saved;
  }
  function logged(task: Task, minutes: number, first: boolean) {
    state.announce(t(ruleFor(task)?.unit === 'count' ? 'Logged {0} counts for {1}.' : 'Logged {0} min for {1}.', minutes, task.title) + vote(task, first));
  }
  function rest(task: Task) { void personal.resolve(task, 'cancelled', state.resolve); }
  function setTimer(next: Timer | null) {
    setTimerState(next); writeTimer(next);
  }
  function toggleFocus(task: Task) {
    const next = liveFocus.includes(task.id) ? liveFocus.filter(id => id !== task.id) : [...liveFocus, task.id];
    if (next.length > FOCUS_LIMIT) return;
    void state.setFocus(today, next);
  }
  // From Close the day: start the two-minute timer at the top of Today.
  function startNow(task: Task) {
    setClosing(false); setRewards(false); setTab('due');
    setTimer({ taskId: task.id, startedAt: Date.now() });
  }
  function closeDay(finished: boolean) {
    setClosing(false); setClosedDay(today); writeClosed(today);
    const open = view ? [...view.due, ...view.upcoming] : [];
    const chosen = view?.focus.tomorrow.some(id => open.some(task => task.id === id));
    if (finished) state.announce(chosen ? 'Day closed. Tomorrow starts with your focus.' : 'Day closed. Rest well.');
  }

  function finishReview(finished: boolean) {
    setReviewing(false); setReviewedWeek(week); writeReviewed(week);
    if (finished) state.announce('Week reviewed. Have a good week.');
  }
  // A new daily target from the weekly review keeps the rest of the plan.
  function setTarget(review: HabitReview, target: number) {
    const rule = rules.get(review.id);
    if (!rule) return Promise.resolve('Open the habit plan to change its target.');
    return personal.savePlan(review.id, { mode: rule.mode, unit: rule.unit ?? 'minutes', rate: rule.rate, target, cue: rule.cue, identity: rule.identity,
      time: rule.time, place: rule.place, starter: rule.starter, bundle: rule.bundle });
  }
  function editPlan(review: HabitReview) {
    setReviewing(false);
    const series = view?.recurrences.find(item => item.id === review.id);
    if (series) editSeries(series);
  }
  // Habit stacking: the new habit starts right after this one, so its title becomes the cue.
  function stack(review: HabitReview) {
    setReviewing(false);
    const cue = /^[A-Z][a-z]/.test(review.title) ? review.title.charAt(0).toLowerCase() + review.title.slice(1) : review.title;
    setSheet({ mode: 'create', id: crypto.randomUUID(), guided: true, cue });
  }

  function insight(task: Task) {
    const rule = ruleFor(task), minutes = data?.progress[task.id] ?? 0;
    const minutesByDay = data?.week.minutes[task.recurrenceId ?? ''] ?? {};
    return habitInsight(task, historyByHabit.get(task.recurrenceId ?? '') ?? [], { done: rule?.mode === 'minutes' ? minutes >= rule.target : false, started: minutes > 0 },
      day => (minutesByDay[day] ?? 0) > 0);
  }
  function row(task: Task) {
    const rule = ruleFor(task);
    if (tab === 'due' && rule?.mode === 'minutes') {
      return <ListItem key={task.id} className="habit-item"><HabitCard task={task} rule={rule} insight={insight(task)} state={personal}
        onEdit={edit} onRest={rest} onLogged={logged} /></ListItem>;
    }
    return <ListItem key={task.id} className="row-item">
      <TaskRow task={task} today={view!.today} busy={saving || !!task.recurrenceId && !data} completable={rule?.mode !== 'minutes'} rule={rule}
        focus={tab === 'due' && !task.recurrenceId
          ? { on: liveFocus.includes(task.id), full: liveFocus.length >= FOCUS_LIMIT, toggle: toggleFocus } : undefined}
        votes={votesFor(rule)}
        {...(tab === 'due' && isHabit(task) ? { insight: insight(task) } : {})}
        {...(data ? { onEdit: edit } : {})}
        {...(tab === 'history' && canReopen(task, view!) ? { onReopen: (id: string) => void state.reopen(id) } : {})}
        onResolve={(_id, status) => status === 'completed' ? complete(task) : personal.resolve(task, status, state.resolve)} />
    </ListItem>;
  }

  return (
    <MotionConfig reducedMotion={settings.reducedMotion ? 'always' : 'user'}>
    <WorkspaceShell workspace="personal" busy={saving} onWorkspaceChange={onWorkspaceChange} navigation={
        <nav aria-label={t("Personal views")}>
          {(['due', 'upcoming', 'history'] as const).map(key => (
            <button
              key={key}
              className={`nav-item ${!rewards && tab === key ? 'active' : ''}`}
              aria-current={!rewards && tab === key ? 'page' : undefined}
              disabled={saving}
              onClick={() => { setRewards(false); setTab(key); }}
            >
              <span className="nav-symbol" aria-hidden="true">{key === 'due' ? '●' : key === 'history' ? '↺' : '○'}</span>
              {t(labels[key])}
              <span className="count">{view?.[key].length ?? '-'}</span>
            </button>
          ))}
          <button className={`nav-item ${rewards ? 'active' : ''}`} aria-current={rewards ? 'page' : undefined}
            disabled={saving} onClick={() => setRewards(true)}>
            <span className="nav-symbol" aria-hidden="true">{'★'}</span>{t("Rewards")}
          </button>
        </nav>
    }>
      <main className="today-main">
        <header className="page-header">
          <div>
            <p className="eyebrow">
              {view ? new Intl.DateTimeFormat(document.documentElement.lang, {
                weekday: 'long', month: 'long', day: 'numeric',
              }).format(new Date(view.today + 'T12:00:00')) : t('Personal tasks')}
            </p>
            <h1>{rewards ? t('Rewards') : t(labels[tab])}</h1>
          </div>
          {!rewards && <div className="header-actions">
            <button className="secondary-button new-button" disabled={!view || saving}
              onClick={() => setSheet({ mode: 'create', id: crypto.randomUUID() })}><PlusIcon />{t("New task")}</button>
            <button className="primary" disabled={!view || saving}
              onClick={() => setSheet({ mode: 'create', id: crypto.randomUUID(), guided: true })}><SparkIcon />{t("New habit")}</button>
          </div>}
        </header>
        {personal.error && <div className="error" role="alert">{t(personal.error)}
          <button disabled={saving} onClick={() => void personal.refresh()}>{t("Refresh points")}</button>
        </div>}
        {rewards ? <RewardShop state={personal} /> : <div className={tab === 'due' ? 'personal-grid' : 'personal-single'}>
          <div className="today-lists">
            {error && (
              <div className="error" role="alert">
                {t(error)}
                <button onClick={() => void refresh()} disabled={busy}>{t("Retry")}</button>
              </div>
            )}
            {tab === 'due' && view && <QuickAdd disabled={saving}
              onAdd={title => state.add({ title, plannedDate: view.today, frequency: 'none' })}
              onMore={title => setSheet({ mode: 'create', id: crypto.randomUUID(), title })} />}
            {tab === 'due' && view && reviewDue && <WeekPrompt busy={saving}
              onOpen={() => setReviewing(true)} onDismiss={() => finishReview(false)} />}
            {tab === 'due' && view && minute >= EVENING && closedDay !== today && <EveningPrompt busy={saving}
              onOpen={() => setClosing(true)} onDismiss={() => closeDay(false)} />}
            {tab === 'due' && view && data && <NowCard items={timers} due={view.due} rules={rules} progress={data.progress} busy={saving}
              timer={timer} onTimer={setTimer}
              onComplete={complete} onLog={log} />}
            <div className="feedback-row">
              <p className="feedback" role="status" aria-live="polite">
                {t(message) || (!view && !error ? t('Loading your tasks.') : '')}
              </p>
              {undo && view?.history.some(task => task.id === undo.id && canReopen(task, view)) && <button className="text-button" disabled={saving} onClick={() => void state.reopen(undo.id)}
                aria-label={t(undo.status === 'completed' ? "Undo completing {0}" : "Undo resting or cancelling {0}", undo.title)}>{t("Undo")}</button>}
            </div>
            {/* Groups move as one when the content above them changes, so their rows never slide on their own. */}
            {view && pointsReady && groups.map(group => {
              const focus = group.key === 'focus', others = tab === 'due' && group.key === 'tasks';
              if (focus ? liveFocus.length === 0 : group.items.length === 0) return null;
              const late = group.items.filter(task => !task.frequency && task.plannedDate < view.today).length;
              const key = tab + ':' + group.key;
              const limit = tab === 'due' ? group.items.length : limits[key] ?? PAGE;
              // Keyed by view as well, so a card folded in one view never animates open after switching views.
              return <FoldCard key={key} title={t(group.title)} count={focus ? undefined : group.items.length}
                className={focus ? 'focus-group' : ''} folded={isFolded(key)} reduced={reduced} busy={saving} onToggle={() => toggleCard(key)}
                badges={<>
                  {focus && <span className="focus-progress">{t("{0} of {1} done", focusDone, liveFocus.length)}</span>}
                  {late > 0 && <span className="overdue-count">{t("{0} overdue", late)}</span>}
                </>}>
                {focus && focusOpen.length === 0 && <p className="group-note focus-done"><CheckIcon />{t("Focus done. Anything else today is a bonus.")}</p>}
                {others && liveFocus.length === 0 && group.items.length > 1 && <p className="group-note">
                  {t("Star up to {0} that matter most today. They move to the top.", FOCUS_LIMIT)}</p>}
                {group.items.length > 0 && <ul className="task-list">
                  <AnimatePresence initial={false} mode="popLayout">{group.items.slice(0, limit).map(row)}</AnimatePresence>
                </ul>}
                <ShowMore hidden={group.items.length - limit} onMore={() => setLimits(current => ({ ...current, [key]: limit + PAGE }))} />
              </FoldCard>;
            })}
            {tab === 'history' && rows.length >= HISTORY_LIMIT && <p className="list-note">
              {t("Showing the latest {0} entries. Older history stays saved on this computer.", HISTORY_LIMIT)}</p>}
            {view && rows.length === 0 && (
              <div className="empty glass">
                <span className="empty-icon"><CheckIcon /></span>
                <h3>{t(text.emptyTitle)}</h3>
                <p>{t(text.emptyDescription)}</p>
                {tab === 'due' && view.upcoming.length > 0 && (
                  <button className="text-button" onClick={() => setTab('upcoming')}>
                    {t("View upcoming tasks")}
                  </button>
                )}
              </div>
            )}
            {/* What was finished today starts folded, below the open work. */}
            {view && pointsReady && tab === 'due' && (['habit', 'task'] as const).map(category => {
              const completed = completedToday.filter(task => isHabit(task) === (category === 'habit'));
              const key = 'due:done-' + category;
              return completed.length > 0 && <FoldCard key={key} title={t(category === 'habit' ? "Habits completed today" : "Tasks completed today")}
                count={completed.length} folded={isFolded(key, true)} reduced={reduced} onToggle={() => toggleCard(key, true)}>
                <ul className="task-list">{completed.map(task => <li key={task.id} className="row-item">
                  <TaskRow task={task} today={view.today} busy={saving} onResolve={async () => false} {...(data ? { onEdit: edit } : {})}
                    {...(canReopen(task, view) ? { onReopen: (id: string) => void state.reopen(id) } : {})} />
                </li>)}</ul>
              </FoldCard>;
            })}
            {tab === 'history' && <ActivityHistory state={personal} />}
          </div>
          {tab === 'due' && progress && <ProgressPanel state={personal} habits={progress.habits} tasks={progress.tasks}
            onOpenRewards={() => setRewards(true)} onCloseDay={() => setClosing(true)} onReview={() => setReviewing(true)} />}
        </div>}
        {/* Before the task window, so the review closes before a window it opens takes focus. */}
        {view && data && <WeeklyReview open={reviewing} today={view.today} reviews={reviews} votes={data.votes} busy={saving}
          onTarget={setTarget} onGraduate={review => state.graduate(review.id, review.title)} onEditPlan={editPlan} onStack={stack}
          onFinish={() => finishReview(true)} onClose={() => setReviewing(false)} />}
        <TaskSheet request={sheet} today={today} busy={saving} anchors={anchors} identities={data?.identities ?? []} habits={view?.recurrences.filter(isHabit).length ?? 0}
          reward={pinned && data ? { title: pinned.title, remaining: pinned.cost - data.balance } : null}
          onCreate={state.add}
          onSavePlan={(id, update) => personal.savePlan(id, { ...update })} onRemove={personal.remove}
          onClose={() => setSheet(null)} />
        <Celebration moment={moment} sound={{ on: settings.sound, volume: settings.volume }} onEnd={() => setMoment(null)}
          reduced={reduced} />
        {view && <CloseDaySheet open={closing} view={view} rules={rules} minutes={data?.progress ?? {}} busy={saving} insightFor={insight}
          onCancel={task => state.settle(task.id, 'cancelled', true)}
          onMove={(task, date) => state.reschedule(task.id, date, true)}
          onFocus={(day, ids) => state.setFocus(day, ids, true)}
          onStartTwoMinutes={startNow} onFinish={() => closeDay(true)} onClose={() => setClosing(false)} />}
      </main>
    </WorkspaceShell>
    </MotionConfig>
  );
}
