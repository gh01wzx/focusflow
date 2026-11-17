import { useEffect, useState } from 'react';

interface PreviewState { stage: string; revision: string; command: string; url: string }
const route = (id: string) => '/api/project-tickets/' + id + '/preview';
export function PreviewPanel({ ticketId }: { ticketId: string }) {
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const abort = new AbortController();
    const read = async () => {
      try {
        const response = await fetch(route(ticketId), { signal: abort.signal });
        const result = await response.json() as PreviewState | null;
        if (response.ok && !abort.signal.aborted) setPreview(result);
      } catch { /* Keep the last observed preview state. */ }
    };
    void read();
    const timer = setInterval(() => void read(), 1500);
    return () => { abort.abort(); clearInterval(timer); };
  }, [ticketId]);
  async function act(action: 'start' | 'stop') {
    setBusy(true); setError('');
    try {
      const response = await fetch(route(ticketId) + '/' + action, { method: 'POST',
        headers: { 'Content-Type': 'application/json' }, body: '{}' });
      const result = await response.json() as (PreviewState & { error?: string }) | null;
      if (!response.ok) throw new Error(result?.error ?? 'Could not start preview.');
      setPreview(result);
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Preview failed.'); }
    finally { setBusy(false); }
  }
  const running = preview?.stage === 'ready' || preview?.stage === 'starting';
  return <section aria-label="Preview">
    <button className="primary" disabled={busy || preview?.stage === 'stopping'} onClick={() => void act(running ? 'stop' : 'start')}>
      {running ? 'Stop preview' : 'Preview'}
    </button>
    {preview && <p role="status">{preview.stage} � {preview.revision} � {preview.command}
      {preview.url && running && <> � <a href={preview.url} target="_blank" rel="noreferrer">Open preview</a></>}</p>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
