import { useEffect, useRef, useState } from 'react';
import { createPublicationClient } from '../../src/client/publication.ts';
import type { PublicationState } from '../../src/shared/publication.ts';

const client = createPublicationClient();
export function usePublicationController(projectId: string, open: boolean, onChange: () => void) {
  const [state, setState] = useState<PublicationState | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const owned = useRef(false), generation = useRef(0), mounted = useRef(true);
  const changed = useRef(onChange); changed.current = onChange;
  async function run(operation: () => Promise<PublicationState>) {
    if (owned.current) return;
    owned.current = true; setBusy(true); setError(''); const token = ++generation.current;
    try { const value = await operation(); if (mounted.current && generation.current === token) { setState(value); changed.current(); } }
    catch (failure) { if (mounted.current && generation.current === token) setError(failure instanceof Error ? failure.message : 'Could not read publication results.'); }
    finally { owned.current = false; if (mounted.current) setBusy(false); }
  }
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; ++generation.current; }; }, []);
  useEffect(() => {
    if (open) void run(() => client.read(projectId)); else ++generation.current;
  }, [open, projectId]);
  useEffect(() => {
    if (!open || !state?.busy) return;
    const timer = setInterval(() => { void run(() => client.read(projectId)); }, 1000);
    return () => clearInterval(timer);
  }, [open, projectId, state?.busy]);
  return { state, busy, error, preview: () => run(() => client.preview(projectId)),
    abandon: () => state?.batch && run(() => client.abandon(projectId, state.batch!.id)),
    publish: (confirmed: boolean) => state?.batch && run(() => client.publish(projectId, state.batch!.id, confirmed)) };
}
