import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { createTaskClient } from '../../src/client/tasks.ts';
import type { Frequency, TaskResolution, TaskView, Weekday } from '../../src/shared/tasks.ts';
import { firstSelectedDate } from '../../src/shared/weekdays.ts';
import type { Tab } from './view-options.ts';
import { reportInterfaceReady } from '../../src/client/build.ts';

const client = createTaskClient();

export function useTodayController() {
  const [view, setView] = useState<TaskView | null>(null);
  const [tab, setTab] = useState<Tab>('due');
  const [title, setTitle] = useState('');
  const [plannedDate, setPlannedDate] = useState('');
  const [frequency, setFrequency] = useState<'none' | Frequency>('none');
  const [weekdays, setWeekdays] = useState<Weekday[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const titleInput = useRef<HTMLInputElement>(null);
  const previousDay = useRef('');
  const busyRef = useRef(false);
  const generation = useRef(0);
  const mounted = useRef(true);
  const focusAfterSave = useRef(false);
  const readyReported = useRef(false);
  useEffect(() => {
    if (!view || readyReported.current) return;
    readyReported.current = true; void reportInterfaceReady().catch(() => { readyReported.current = false; });
  }, [view]);

  useEffect(() => {
    if (!busy && focusAfterSave.current) {
      titleInput.current?.focus();
      focusAfterSave.current = false;
    }
  }, [busy]);

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

  async function change(operation: () => Promise<TaskView>, success: string, added = false) {
    if (busyRef.current) return;
    busyRef.current = true;
    ++generation.current;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      apply(await operation());
      setMessage(success);
      if (added) {
        setTitle('');
        const firstDate = frequency === 'weekly' ? firstSelectedDate(plannedDate, weekdays) : plannedDate;
        setTab((firstDate ?? plannedDate) > (view?.today ?? '') ? 'upcoming' : 'due');
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not save. Please try again.');
    } finally {
      focusAfterSave.current = added;
      busyRef.current = false;
      setBusy(false);
    }
  }
  function add(event: FormEvent) {
    event.preventDefault();
    void change(() => client.add({ title, plannedDate, frequency,
      ...(frequency === 'weekly' ? { weekdays } : {}) }), 'Task added.', true);
  }

  return {
    view, tab, setTab, title, setTitle, plannedDate, setPlannedDate,
    frequency, setFrequency, weekdays, setWeekdays, busy, error, message, titleInput, add, refresh,
    resolve: (id: string, status: TaskResolution) => change(
      () => client.resolve(id, status), status === 'completed' ? 'Task completed.' : 'Task cancelled.',
    ),
    stopRecurrence: (id: string) => change(
      () => client.stopRecurrence(id), 'Repeating stopped. Current-period tasks stay available.',
    ),
  };
}

export type TodayController = ReturnType<typeof useTodayController>;
