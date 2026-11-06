import { useEffect, useRef, useState } from 'react';
import { createActionClient } from '../../src/client/actions.ts';
import type { ProjectView } from '../../src/shared/projects.ts';
const client = createActionClient();
export function useActionsController() {
  const [views, setViews] = useState<ProjectView[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const pending = useRef(false);
  const generation = useRef(0);
  const mounted = useRef(true);
  async function refresh() {
    if (pending.current) return;
    const token = ++generation.current;
    try {
      const next = await client.read();
      if (mounted.current && token === generation.current) { setViews(next); setError(''); }
    } catch { if (mounted.current && token === generation.current) setError('Could not load project actions. Try again.'); }
  }
  useEffect(() => {
    mounted.current = true;
    void refresh();
    const visible = () => { if (!document.hidden) void refresh(); };
    const timer = setInterval(visible, 30_000);
    window.addEventListener('focus', visible);
    document.addEventListener('visibilitychange', visible);
    return () => { mounted.current = false; ++generation.current; clearInterval(timer);
      window.removeEventListener('focus', visible); document.removeEventListener('visibilitychange', visible); };
  }, []);
  async function start(id: string) {
    if (pending.current) return;
    pending.current = true; ++generation.current; setBusy(true); setError(''); setMessage('');
    try {
      const next = await client.start(id);
      if (mounted.current) { setViews(next); setMessage('Ticket started.'); }
    } catch (failure) {
      if (mounted.current) setError(failure instanceof Error ? failure.message : 'Could not start this ticket.');
    } finally { pending.current = false; if (mounted.current) setBusy(false); }
  }
  return { views, error, busy, message, refresh, start };
}
