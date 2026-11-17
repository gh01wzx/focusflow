import { useState } from 'react';
import { usePersonal } from './usePersonal.ts';
import { ActivityHistory, HabitRow, PointsJar, RewardShop, ScoringEditor } from './components/PersonalRewards.tsx';
import { points } from '../../src/shared/personal.ts';
import { WorkspaceShell } from '../workspace/WorkspaceShell.tsx';
import type { WorkspaceProps } from '../workspace/WorkspaceShell.tsx';
import { useTodayController } from './useTodayController.ts';
import { labels, tabText } from './view-options.ts';
import { TaskComposer } from './components/TaskComposer.tsx';
import { TaskRow } from './components/TaskRow.tsx';
import { RepeatingTasks } from './components/RepeatingTasks.tsx';
import { CheckIcon } from './components/CheckIcon.tsx';

export function TodayApp({ onWorkspaceChange }: WorkspaceProps) {
  const state = useTodayController();
  const { view, tab, setTab, busy, error, message, refresh } = state;
  const personal = usePersonal(view, refresh);
  const [rewards, setRewards] = useState(false);
  const rows = view?.[tab] ?? [];
  const overdue = view?.due.filter(task => !task.frequency && task.plannedDate < view.today).length ?? 0;
  const text = tabText[tab];

  return (
    <WorkspaceShell workspace="personal" busy={busy} onWorkspaceChange={onWorkspaceChange} navigation={
        <nav aria-label="Personal views">
          {(['due', 'upcoming', 'history'] as const).map(key => (
            <button
              key={key}
              className={`nav-item ${tab === key ? 'active' : ''}`}
              aria-current={tab === key ? 'page' : undefined}
              onClick={() => { setRewards(false); setTab(key); }}
            >
              <span className="nav-symbol" aria-hidden="true">{key === 'due' ? '\u25cf' : key === 'history' ? '\u21ba' : '\u25cb'}</span>
              {labels[key]}
              <span className="count">{view?.[key].length ?? '-'}</span>
            </button>
          ))}
          <button className={`nav-item ${rewards ? 'active' : ''}`} onClick={() => setRewards(true)}>Rewards</button>
        </nav>
    }>
      <main>

        <header className="page-header">
          <div>
            <p className="eyebrow">
              {view ? new Intl.DateTimeFormat('en', {
                weekday: 'long', month: 'long', day: 'numeric',
              }).format(new Date(view.today + 'T12:00:00')) : 'PERSONAL TASKS'}
            </p>
            <h1>{rewards ? 'Rewards' : labels[tab]}</h1>
          </div>
          {view && !rewards && (
            <div className="summary">
              <strong>{rows.length}</strong>
              <span>{tab === 'history' ? 'recorded' : 'pending'}</span>
            </div>
          )}
        </header>
        {personal.error && <p className="error" role="alert">{personal.error}</p>}
        {rewards ? <RewardShop state={personal} /> : <div className={tab === 'due' ? 'personal-grid' : ''}>
        <div>
        {tab === 'due' && <TaskComposer state={state} />}
        {error && (
          <div className="error" role="alert">
            {error}
            <button onClick={() => void refresh()} disabled={busy}>Retry</button>
          </div>
        )}
        <p className="feedback" role="status" aria-live="polite">
          {message || (!view && !error ? 'Loading your tasks.' : '')}
        </p>
        <section className="task-section" aria-busy={busy} aria-label={labels[tab] + ' tasks'}>
          <div className="section-heading">
            <h2>{tab === 'due' ? 'Your task list' : labels[tab]}<span>{rows.length}</span></h2>
            {tab === 'due' && overdue > 0 && <span className="overdue-count">{overdue} overdue</span>}

          </div>
          {view && rows.length > 0 && (
            <ul className="task-list">
              {rows.map(task => {
                const rule = personal.data?.rules.find(item => item.subject === (task.recurrenceId ?? task.id));
                return tab === 'due' && rule?.mode === 'minutes' ? <HabitRow key={task.id} task={task} rule={rule} state={personal} />
                  : <li className="task-with-scoring" key={task.id}>
                    <ul><TaskRow task={task} today={view.today} busy={busy || personal.busy}
                      onResolve={(_id, status) => personal.resolve(task, status, state.resolve)} /></ul>
                    {tab === 'due' && personal.data && <div className="task-points">
                      {!!rule?.rate && <span>+{points(rule.rate)} points</span>}
                      <ScoringEditor key={String(rule?.rate) + rule?.mode} task={task} {...(rule ? { rule } : {})} state={personal} />
                    </div>}
                  </li>;
              })}
            </ul>
          )}
          {view && rows.length === 0 && (
            <div className="empty">
              <span className="empty-icon"><CheckIcon /></span>
              <h3>{text.emptyTitle}</h3>
              <p>{text.emptyDescription}</p>
              {tab === 'due' && view.upcoming.length > 0 && (
                <button className="text-button" onClick={() => setTab('upcoming')}>
                  View upcoming tasks {'\u001a'}
                </button>
              )}
            </div>
          )}
        </section>
        {tab === 'due' && <>
          <RepeatingTasks rules={view?.recurrences ?? []} busy={busy} onStop={state.stopRecurrence} />
          {!!view?.history.some(task => task.status === 'completed' && task.resolvedAt && new Date(task.resolvedAt).toDateString() === new Date().toDateString()) &&
            <details><summary>Completed today</summary><ul>{view.history.filter(task => task.status === 'completed' && task.resolvedAt
              && new Date(task.resolvedAt).toDateString() === new Date().toDateString()).map(task => <li key={task.id}>{task.title}</li>)}</ul></details>}
        </>}
        {tab === 'history' && <ActivityHistory state={personal} />}
        </div>
        {tab === 'due' && <PointsJar state={personal} openRewards={() => setRewards(true)} />}
        </div>}
        <footer>
          <span className="local-dot" />Changes save automatically
          <span className="footer-detail">Personal ? Local tasks</span>
        </footer>
      </main>
    </WorkspaceShell>
  );
}
