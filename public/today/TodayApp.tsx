import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { usePersonal } from './usePersonal.ts';
import { ActivityHistory, RewardShop } from './components/PersonalRewards.tsx';
import type { ScoringRule } from '../../src/shared/personal.ts';
import { HISTORY_LIMIT } from '../../src/shared/tasks.ts';
import type { Task } from '../../src/shared/tasks.ts';
import { localDay } from '../../src/shared/calendar.ts';
import { habitInsight, nextUp, todayProgress } from '../../src/shared/habits.ts';
import { WorkspaceShell } from '../workspace/WorkspaceShell.tsx';
import type { WorkspaceProps } from '../workspace/WorkspaceShell.tsx';
import { useTodayController } from './useTodayController.ts';
import { canReopen, labels, tabText } from './view-options.ts';
import { TaskRow } from './components/TaskRow.tsx';
import { HabitCard } from './components/HabitCard.tsx';
import { TaskSheet } from './components/TaskSheet.tsx';
import type { SheetRequest } from './components/TaskSheet.tsx';
import { ProgressPanel } from './components/ProgressPanel.tsx';
import { RepeatingTasks } from './components/RepeatingTasks.tsx';
import { NowCard } from './components/NowCard.tsx';
import { QuickAdd } from './components/QuickAdd.tsx';
import { ListItem, spring } from './components/Animated.tsx';
import { CheckIcon, PlusIcon, SparkIcon } from './components/Icons.tsx';

const SKIPPED_KEY = 'focusflow.skipped';
// "Later" is a per-day convenience kept in this browser only.
function readSkipped(day: string): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(SKIPPED_KEY) ?? 'null') as { day?: string; ids?: string[] } | null;
    return value?.day === day && Array.isArray(value.ids) ? value.ids.filter(id => typeof id === 'string') : [];
  } catch { return []; }
}
function writeSkipped(day: string, ids: string[]) {
  try { localStorage.setItem(SKIPPED_KEY, JSON.stringify({ day, ids })); } catch { /* Kept for this page only. */ }
}

export function TodayApp({ onWorkspaceChange }: WorkspaceProps) {
  const state = useTodayController();
  const { view, tab, setTab, busy, error, message, undo, refresh } = state;
  const personal = usePersonal(view, refresh);
  const [rewards, setRewards] = useState(false);
  const [sheet, setSheet] = useState<SheetRequest | null>(null);
  const [skipped, setSkipped] = useState<string[]>([]);
  // A minute clock keeps "Next" in step with planned times.
  const [minute, setMinute] = useState(() => new Date().toTimeString().slice(0, 5));
  const saving = busy || personal.busy;
  const data = personal.data;
  const today = view?.today ?? '';
  const rules = useMemo(() => new Map<string, ScoringRule>(data?.rules.map(rule => [rule.subject, rule])), [data]);
  const ruleFor = (task: Task) => rules.get(task.recurrenceId ?? task.id);
  const completedToday = useMemo(() => view?.history.filter(task => task.status === 'completed' && task.resolvedAt
    && localDay(new Date(task.resolvedAt)) === view.today) ?? [], [view]);
  const progress = view ? todayProgress(view, rules, data?.progress ?? {}, completedToday) : null;
  const pinned = data?.rewards.find(item => item.id === data.preferences.pinnedReward);
  const rows = view?.[tab] ?? [];
  const groups = tab === 'due'
    ? [{ key: 'habits', title: 'Habits', items: rows.filter(task => task.recurrenceId) }, { key: 'tasks', title: 'Tasks', items: rows.filter(task => !task.recurrenceId) }]
    : [{ key: tab, title: labels[tab], items: rows }];
  const overdue = view?.due.filter(task => !task.frequency && task.plannedDate < view.today).length ?? 0;
  const text = tabText[tab];
  const upNext = view && data ? nextUp(view.due, rules, data.progress, minute) : [];
  const candidates = upNext.filter(task => !skipped.includes(task.id));
  const anchors = useMemo(() => [...new Set((data?.rules ?? []).map(rule => rule.cue).filter(Boolean))], [data]);

  useEffect(() => { if (today) setSkipped(readSkipped(today)); }, [today]);
  useEffect(() => {
    const id = setInterval(() => setMinute(new Date().toTimeString().slice(0, 5)), 60_000);
    return () => clearInterval(id);
  }, []);

  const edit = (task: Task) => setSheet({ mode: 'edit', id: crypto.randomUUID(), task, rule: ruleFor(task) });
  // Each completion is framed as a vote for the identity the habit supports.
  const vote = (task: Task) => {
    const identity = ruleFor(task)?.identity;
    return identity ? ` A vote for “${identity}”.` : '';
  };
  async function complete(task: Task) {
    const saved = await personal.resolve(task, 'completed', state.resolve);
    if (saved && vote(task)) state.announce('Task completed.' + vote(task));
    return saved;
  }
  async function log(task: Task, minutes: number) {
    if (!data) return false;
    const saved = await personal.mutate('log', { id: crypto.randomUUID(), day: data.day, subject: task.id, minutes }, ruleFor(task)?.target);
    if (saved) logged(task, minutes);
    return saved;
  }
  function logged(task: Task, minutes: number) {
    state.announce(`Logged ${minutes} min for ${task.title}.` + vote(task));
  }
  function rest(task: Task) { void personal.resolve(task, 'cancelled', state.resolve); }
  function skip(task: Task) {
    const ids = [...new Set([...skipped, task.id])];
    setSkipped(ids); writeSkipped(today, ids);
  }

  function insight(task: Task) {
    const rule = ruleFor(task), minutes = data?.progress[task.id] ?? 0;
    const minutesByDay = data?.week.minutes[task.recurrenceId ?? ''] ?? {};
    return habitInsight(task, view!.history, { done: rule?.mode === 'minutes' ? minutes >= rule.target : false, started: minutes > 0 },
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
        {...(tab === 'due' && task.recurrenceId ? { insight: insight(task) } : {})}
        {...(tab !== 'history' && data ? { onEdit: edit } : {})}
        {...(tab === 'history' && canReopen(task, view!) ? { onReopen: (id: string) => void state.reopen(id) } : {})}
        onResolve={(_id, status) => status === 'completed' ? complete(task) : personal.resolve(task, status, state.resolve)} />
    </ListItem>;
  }

  return (
    <MotionConfig reducedMotion={data?.preferences.reducedMotion ? 'always' : 'user'}>
    <WorkspaceShell workspace="personal" busy={saving} onWorkspaceChange={onWorkspaceChange} navigation={
        <nav aria-label="Personal views">
          {(['due', 'upcoming', 'history'] as const).map(key => (
            <button
              key={key}
              className={`nav-item ${!rewards && tab === key ? 'active' : ''}`}
              aria-current={!rewards && tab === key ? 'page' : undefined}
              disabled={saving}
              onClick={() => { setRewards(false); setTab(key); }}
            >
              <span className="nav-symbol" aria-hidden="true">{key === 'due' ? '●' : key === 'history' ? '↺' : '○'}</span>
              {labels[key]}
              <span className="count">{view?.[key].length ?? '-'}</span>
            </button>
          ))}
          <button className={`nav-item ${rewards ? 'active' : ''}`} aria-current={rewards ? 'page' : undefined}
            disabled={saving} onClick={() => setRewards(true)}>
            <span className="nav-symbol" aria-hidden="true">{'★'}</span>Rewards
          </button>
        </nav>
    }>
      <main className="today-main">
        <header className="page-header">
          <div>
            <p className="eyebrow">
              {view ? new Intl.DateTimeFormat('en', {
                weekday: 'long', month: 'long', day: 'numeric',
              }).format(new Date(view.today + 'T12:00:00')) : 'Personal tasks'}
            </p>
            <h1>{rewards ? 'Rewards' : labels[tab]}</h1>
          </div>
          {!rewards && <div className="header-actions">
            <button className="secondary-button new-button" disabled={!view || saving}
              onClick={() => setSheet({ mode: 'create', id: crypto.randomUUID() })}><PlusIcon />New task</button>
            <button className="primary" disabled={!view || saving}
              onClick={() => setSheet({ mode: 'create', id: crypto.randomUUID(), guided: true })}><SparkIcon />New habit</button>
          </div>}
        </header>
        {personal.error && <div className="error" role="alert">{personal.error}
          <button disabled={saving} onClick={() => void personal.refresh()}>Refresh points</button>
        </div>}
        {rewards ? <RewardShop state={personal} /> : <div className={tab === 'due' ? 'personal-grid' : 'personal-single'}>
          <div className="today-lists">
            {error && (
              <div className="error" role="alert">
                {error}
                <button onClick={() => void refresh()} disabled={busy}>Retry</button>
              </div>
            )}
            {tab === 'due' && view && <QuickAdd disabled={saving}
              onAdd={title => state.add({ title, plannedDate: view.today, frequency: 'none' })}
              onMore={title => setSheet({ mode: 'create', id: crypto.randomUUID(), title })} />}
            {tab === 'due' && view && data && <NowCard candidates={candidates} due={view.due} rules={rules} busy={saving}
              sound={{ on: data.preferences.sound, volume: data.preferences.volume }} skipped={upNext.length - candidates.length}
              onComplete={complete} onLog={log} onSkip={skip} onShowSkipped={() => { setSkipped([]); writeSkipped(today, []); }} />}
            <div className="feedback-row">
              <p className="feedback" role="status" aria-live="polite">
                {message || (!view && !error ? 'Loading your tasks.' : '')}
              </p>
              {undo && <button className="text-button" disabled={saving} onClick={() => void state.reopen(undo.id)}
                aria-label={`Undo ${undo.status === 'completed' ? 'completing' : 'resting or cancelling'} ${undo.title}`}>Undo</button>}
            </div>
            {/* Groups move as one when the content above them changes, so their rows never slide on their own. */}
            {view && groups.map(group => group.items.length > 0 && <motion.section key={group.key} layout="position" transition={spring}
              className="list-group glass" aria-label={group.title + (tab === 'due' ? '' : ' tasks')} aria-busy={saving}>
              <div className="group-heading">
                <h2>{group.title}<span className="count">{group.items.length}</span></h2>
                {group.key === 'tasks' && overdue > 0 && <span className="overdue-count">{overdue} overdue</span>}
              </div>
              <ul className="task-list">
                <AnimatePresence initial={false} mode="popLayout">{group.items.map(row)}</AnimatePresence>
              </ul>
            </motion.section>)}
            {tab === 'history' && rows.length >= HISTORY_LIMIT && <p className="list-note">
              Showing the latest {HISTORY_LIMIT} entries. Older history stays saved on this computer.</p>}
            {view && rows.length === 0 && (
              <div className="empty glass">
                <span className="empty-icon"><CheckIcon /></span>
                <h3>{text.emptyTitle}</h3>
                <p>{text.emptyDescription}</p>
                {tab === 'due' && view.upcoming.length > 0 && (
                  <button className="text-button" onClick={() => setTab('upcoming')}>
                    View upcoming tasks
                  </button>
                )}
              </div>
            )}
            {tab === 'due' && <>
              {completedToday.length > 0 && <details className="completions glass">
                <summary>Completed today ({completedToday.length})</summary>
                <ul className="task-list">{completedToday.map(task => <li key={task.id} className="row-item">
                  <TaskRow task={task} today={view!.today} busy={saving} onResolve={async () => false}
                    {...(canReopen(task, view!) ? { onReopen: (id: string) => void state.reopen(id) } : {})} />
                </li>)}</ul>
              </details>}
              <RepeatingTasks rules={view?.recurrences ?? []} busy={saving} onStop={state.stopRecurrence} />
            </>}
            {tab === 'history' && <ActivityHistory state={personal} />}
          </div>
          {tab === 'due' && progress && <ProgressPanel state={personal} habits={progress.habits} tasks={progress.tasks}
            onOpenRewards={() => setRewards(true)} />}
        </div>}
        <TaskSheet request={sheet} today={today} busy={saving} anchors={anchors}
          reward={pinned && data ? { title: pinned.title, remaining: pinned.cost - data.balance } : null}
          onCreate={state.add}
          onSavePlan={(task, update) => personal.savePlan(task.id, { ...update })}
          onClose={() => setSheet(null)} />
      </main>
    </WorkspaceShell>
    </MotionConfig>
  );
}
