import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { FormEvent } from 'react';
import type { Task, TaskView } from '../../src/tasks/model.ts';

type Tab = 'due' | 'upcoming' | 'history';
const labels: Record<Tab, string> = { due: 'Today', upcoming: 'Upcoming', history: 'History' };
const dateText = (date: string) => new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(date + 'T12:00:00'));

function CheckIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 12 4 4 8-8" /></svg>;
}
async function api(path: string, value?: unknown): Promise<TaskView> {
  const response = await fetch(path, value === undefined ? {} : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value),
  });
  const payload = await response.json() as { error?: string; view?: TaskView } & Partial<TaskView>;
  if (!response.ok) throw new Error(payload.error ?? 'Could not save. Please try again.');
  const view = payload.view ?? payload;
  if (typeof view.today !== 'string' || !Array.isArray(view.due) || !Array.isArray(view.upcoming) || !Array.isArray(view.history)) {
    throw new Error('Could not read local tasks. Restart FocusFlow and try again.');
  }
  return view as TaskView;
}

function App() {
  const [view, setView] = useState<TaskView | null>(null);
  const [tab, setTab] = useState<Tab>('due');
  const [title, setTitle] = useState('');
  const [plannedDate, setPlannedDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const titleInput = useRef<HTMLInputElement>(null);
  const previousDay = useRef('');
  const busyRef = useRef(false);
  const generation = useRef(0);
  const mounted = useRef(true);

  function apply(next: TaskView) {
    const oldDay = previousDay.current;
    setView(next);
    setPlannedDate(current => !current || current === oldDay ? next.today : current);
    previousDay.current = next.today;
  }
  async function refresh() {
    if (busyRef.current) return;
    const token = ++generation.current;
    try {
      const next = await api('/api/tasks');
      if (mounted.current && token === generation.current) { apply(next); setError(''); }
    } catch (failure) {
      if (mounted.current && token === generation.current) setError(failure instanceof Error ? failure.message : 'Could not load tasks.');
    }
  }
  useEffect(() => {
    mounted.current = true;
    const visible = () => { if (!document.hidden) void refresh(); };
    void refresh();
    const timer = setInterval(visible, 30_000);
    window.addEventListener('focus', visible);
    document.addEventListener('visibilitychange', visible);
    return () => {
      mounted.current = false; clearInterval(timer);
      window.removeEventListener('focus', visible); document.removeEventListener('visibilitychange', visible);
    };
  }, []);

  async function change(path: string, value: unknown, success: string, added = false) {
    if (busyRef.current) return;
    busyRef.current = true; ++generation.current;
    setBusy(true); setError(''); setMessage('');
    try {
      apply(await api(path, value)); setMessage(success);
      if (added) { setTitle(''); setTab(plannedDate > (view?.today ?? '') ? 'upcoming' : 'due'); }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not save. Please try again.');
    } finally {
      busyRef.current = false; setBusy(false);
      if (added) titleInput.current?.focus();
    }
  }
  function add(event: FormEvent) {
    event.preventDefault();
    void change('/api/tasks', { title, plannedDate }, 'Task added.', true);
  }
  const rows = view?.[tab] ?? [];
  const overdue = view?.due.filter(task => task.plannedDate < view.today).length ?? 0;

  function taskRow(task: Task) {
    const pending = task.status === 'pending';
    const late = pending && task.plannedDate < (view?.today ?? '');
    return <li key={task.id} className={`task ${pending ? '' : 'resolved'}`}>
      {pending ? <input className="task-check" type="checkbox" aria-label={`Complete ${task.title}`} checked={false} disabled={busy}
        onChange={() => void change(`/api/tasks/${task.id}/resolve`, { status: 'completed' }, 'Task completed.')} />
        : <span className={`resolved-mark ${task.status}`}><CheckIcon /></span>}
      <div className="task-content"><span className="task-title">{task.title}</span>
        <div className="task-meta"><span>Planned {dateText(task.plannedDate)}</span>
          {late && <span className="overdue">Overdue</span>}
          {!pending && <><span className={`state ${task.status}`}>{task.status === 'completed' ? 'Completed' : 'Cancelled'}</span>
            {task.resolvedAt && <span>{new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(new Date(task.resolvedAt))}</span>}</>}
        </div>
      </div>
      {pending && <button className="cancel" disabled={busy} aria-label={`Cancel ${task.title}`}
        onClick={() => void change(`/api/tasks/${task.id}/resolve`, { status: 'cancelled' }, 'Task cancelled.')}>Cancel</button>}
    </li>;
  }

  return <div className="shell">
    <aside className="sidebar"><a className="brand" href="/" aria-label="FocusFlow home"><span className="brand-mark">f<span>.</span></span>FocusFlow</a>
      <div className="workspace-label">YOUR WORKSPACE</div><div className="space-title"><span className="avatar">P</span>Personal<span className="local-pill">Local</span></div>
      <nav aria-label="Personal views">{(['due', 'upcoming', 'history'] as const).map(key => <button key={key}
        className={`nav-item ${tab === key ? 'active' : ''}`} aria-current={tab === key ? 'page' : undefined} onClick={() => setTab(key)}>
        <span className="nav-symbol" aria-hidden="true">{key === 'due' ? '◉' : key === 'upcoming' ? '▦' : '◷'}</span>{labels[key]}
        <span className="count">{view?.[key].length ?? '–'}</span></button>)}</nav>
      <div className="sidebar-note"><span className="local-dot" />Saved on this computer</div>
    </aside>
    <main>
      <div className="breadcrumb">Personal <span>/</span> {labels[tab]}</div>
      <header className="page-header"><div><p className="eyebrow">{view ? new Intl.DateTimeFormat('en', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date(view.today + 'T12:00:00')) : 'PERSONAL TASKS'}</p>
        <h1>{labels[tab]}<span className="heading-dot">.</span></h1>
        <p className="subtitle">{tab === 'due' ? 'A clear view of what needs doing.' : tab === 'upcoming' ? 'Your plans for the days ahead.' : 'A record of completed and cancelled tasks.'}</p></div>
        {view && <div className="summary"><strong>{tab === 'due' ? view.due.length : rows.length}</strong><span>{tab === 'history' ? 'recorded' : 'pending'}</span></div>}
      </header>
      <form className="composer" onSubmit={add}>
        <label className="sr-only" htmlFor="task-title">Task title</label>
        <span className="add-symbol" aria-hidden="true">+</span>
        <input id="task-title" ref={titleInput} value={title} onChange={event => setTitle(event.target.value)} maxLength={300}
          placeholder="What needs doing?" autoComplete="off" required disabled={!view || busy} />
        <div className="date-field"><label htmlFor="planned-date">Planned date</label><input id="planned-date" aria-label="Planned date" type="date"
          value={plannedDate} onChange={event => setPlannedDate(event.target.value)} required disabled={!view || busy} /></div>
        <button className="primary" type="submit" disabled={!view || busy || !title.trim()}>{busy ? 'Saving…' : 'Add task'}<span aria-hidden="true">↗</span></button>
      </form>
      {error && <div className="error" role="alert">{error}<button onClick={() => void refresh()} disabled={busy}>Retry</button></div>}
      <p className="feedback" role="status" aria-live="polite">{message || (!view && !error ? 'Loading your tasks…' : '')}</p>
      <section className="task-section" aria-busy={busy} aria-label={labels[tab] + ' tasks'}>
        <div className="section-heading"><h2>{tab === 'due' ? 'Your task list' : labels[tab]}<span>{rows.length}</span></h2>
          {tab === 'due' && overdue > 0 && <span className="overdue-count">{overdue} overdue</span>}
          {tab === 'due' && <span className="section-hint">Check a task to complete it</span>}</div>
        {view && rows.length > 0 && <ul className="task-list">{rows.map(taskRow)}</ul>}
        {view && rows.length === 0 && <div className="empty"><span className="empty-icon"><CheckIcon /></span>
          <h3>{tab === 'due' ? "You're clear for today" : tab === 'upcoming' ? 'Nothing planned ahead' : 'Your history starts here'}</h3>
          <p>{tab === 'due' ? 'Add a task above when something comes up.' : tab === 'upcoming' ? 'Choose a future date when adding a task.' : 'Completed and cancelled tasks will appear here.'}</p>
          {tab === 'due' && (view.upcoming.length > 0) && <button className="text-button" onClick={() => setTab('upcoming')}>View upcoming tasks →</button>}</div>}
      </section>
      <footer><span className="local-dot" />Changes save automatically<span className="footer-detail">Personal · Temporary tasks</span></footer>
    </main>
  </div>;
}

const root = document.getElementById('root');
if (!root) throw new Error('Missing application root');
createRoot(root).render(<App />);
