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
              onClick={() => setTab(key)}
            >
              <span className="nav-symbol" aria-hidden="true">?</span>
              {labels[key]}
              <span className="count">{view?.[key].length ?? '-'}</span>
            </button>
          ))}
        </nav>
    }>
      <main>
        <div className="breadcrumb">Personal <span>/</span> {labels[tab]}</div>
        <header className="page-header">
          <div>
            <p className="eyebrow">
              {view ? new Intl.DateTimeFormat('en', {
                weekday: 'long', month: 'long', day: 'numeric',
              }).format(new Date(view.today + 'T12:00:00')) : 'PERSONAL TASKS'}
            </p>
            <h1>{labels[tab]}<span className="heading-dot">.</span></h1>
            <p className="subtitle">{text.subtitle}</p>
          </div>
          {view && (
            <div className="summary">
              <strong>{rows.length}</strong>
              <span>{tab === 'history' ? 'recorded' : 'pending'}</span>
            </div>
          )}
        </header>
        <TaskComposer state={state} />
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
            {tab === 'due' && <span className="section-hint">Check a task to complete it</span>}
          </div>
          {view && rows.length > 0 && (
            <ul className="task-list">
              {rows.map(task => (
                <TaskRow key={task.id} task={task} today={view.today} busy={busy} onResolve={state.resolve} />
              ))}
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
        <RepeatingTasks rules={view?.recurrences ?? []} busy={busy} onStop={state.stopRecurrence} />
        <footer>
          <span className="local-dot" />Changes save automatically
          <span className="footer-detail">Personal · Local tasks</span>
        </footer>
      </main>
    </WorkspaceShell>
  );
}
