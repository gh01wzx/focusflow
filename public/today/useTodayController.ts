import { t } from '../workspace/locale.ts';
import { isHabit } from '../../src/shared/tasks.ts';
import { useEffect, useRef, useState } from 'react';
import { createTaskClient } from '../../src/client/tasks.ts';
import type { TaskDraft, TaskResolution, TaskView } from '../../src/shared/tasks.ts';
import { firstSelectedDate } from '../../src/shared/weekdays.ts';
import { dateText } from './view-options.ts';
import type { Tab } from './view-options.ts';

const client = createTaskClient();

export function useTodayController() {
  const [view, setView] = useState<TaskView | null>(null);
  const [tab, setTab] = useState<Tab>('due');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  // The last completion or cancellation, offered as Undo until the next change.
  const [undo, setUndo] = useState<{ id: string; title: string; status: TaskResolution } | null>(null);
  const shown = useRef('');
  const busyRef = useRef(false);
  const generation = useRef(0);
  const mounted = useRef(true);

  function apply(next: TaskView) {
    // Background refreshes usually return the same tasks. Keeping the current object
    // avoids re-rendering every row and re-reading points for an unchanged list.
    const serialized = JSON.stringify(next);
    if (serialized === shown.current) return;
    shown.current = serialized;
    setView(next);
  }
  async function refresh() {
    if (busyRef.current) return;
    const token = ++generation.current;
    try {
      const next = await client.read();
      if (mounted.current && token === generation.current) {
        apply(next);
        setError('');
      }
    } catch (failure) {
      if (mounted.current && token === generation.current) {
        setError(failure instanceof Error ? failure.message : 'Could not load tasks.');
      }
    }
  }
  useEffect(() => {
    mounted.current = true;
    const visible = () => {
      if (!document.hidden) void refresh();
    };
    void refresh();
    const timer = setInterval(visible, 30_000);
    window.addEventListener('focus', visible);
    document.addEventListener('visibilitychange', visible);
    return () => {
      mounted.current = false;
      clearInterval(timer);
      window.removeEventListener('focus', visible);
      document.removeEventListener('visibilitychange', visible);
    };
  }, []);

  // Returns an error message, or an empty string after saving. An inline change reports its
  // error to the window that started it instead of the page.
  async function change(operation: () => Promise<TaskView>, success: string,
    options: { draft?: TaskDraft; inline?: boolean } = {}): Promise<string> {
    if (busyRef.current) return 'Another change is still saving. Try again in a moment.';
    busyRef.current = true;
    ++generation.current;
    setBusy(true);
    setError('');
    setMessage('');
    setUndo(null);
    try {
      const next = await operation();
      if (!mounted.current) return '';
      apply(next);
      setMessage(success);
      if (options.draft) {
        const draft = options.draft;
        const firstDate = draft.frequency === 'weekly' ? firstSelectedDate(draft.plannedDate, draft.weekdays ?? []) : draft.plannedDate;
        setTab((firstDate ?? draft.plannedDate) > next.today ? 'upcoming' : 'due');
      }
      return '';
    } catch (failure) {
      const text = failure instanceof Error ? failure.message : 'Could not save. Please try again.';
      if (mounted.current && !options.inline) setError(text);
      return text;
    } finally {
      busyRef.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  // Completes or cancels a task and offers Undo. Returns an error message, or an empty string after saving.
  async function settle(id: string, status: TaskResolution, inline = false) {
    const task = view && [...view.due, ...view.upcoming].find(item => item.id === id);
    const failure = await change(() => client.resolve(id, status), status === 'completed' ? (task && isHabit(task) ? 'Habit completed.' : 'Task completed.')
      : task && isHabit(task) ? 'Rest day recorded. Your chain stays intact.' : 'Task cancelled.', { inline });
    if (!failure && task && mounted.current) setUndo({ id, title: task.title, status });
    return failure;
  }

  return {
    view, tab, setTab, busy, error, message, undo, refresh, settle,
    add: (draft: TaskDraft) => change(() => client.add(draft), draft.category === 'habit' ? 'Habit added.' : 'Task added.', { draft, inline: true }),
    // Returns whether the change was saved, so a checked circle can clear again after a failure.
    resolve: async (id: string, status: TaskResolution) => !await settle(id, status),
    // Replaces the status line, for feedback from Personal points actions such as a habit log.
    announce: (text: string) => { if (mounted.current) setMessage(text); },
    reopen: (id: string) => change(() => client.reopen(id), 'Task reopened.'),
    // Inline calls come from the Close the day window, which shows its own errors.
    reschedule: (id: string, plannedDate: string, inline = false) =>
      change(() => client.reschedule(id, plannedDate), t('Moved to {0}.', dateText(plannedDate)), { inline }),
    setFocus: (day: string, taskIds: string[], inline = false) =>
      change(() => client.setFocus(day, taskIds), day === view?.today ? 'Focus updated.' : "Tomorrow's focus saved.", { inline }),
    // From the weekly review: a steady habit leaves Today and keeps its history.
    graduate: (id: string, title: string) =>
      change(() => client.stopRecurrence(id), t('Graduated “{0}”. Its history stays.', title), { inline: true }),
  };
}
