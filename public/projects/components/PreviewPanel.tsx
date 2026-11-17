import { useEffect, useRef, useState } from 'react';

const stageLabels = {
  starting: 'Starting', ready: 'Ready', stopping: 'Stopping', stopped: 'Stopped',
  failed: 'Launch failed', uncertain: 'Needs attention',
};
interface PreviewState { stage: keyof typeof stageLabels; revision: string; command: string; url: string; profile: string }
const route = (id: string) => '/api/project-tickets/' + id + '/preview';

export function PreviewPanel({ ticketId }: { ticketId: string }) {
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState('');
  const [readError, setReadError] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const version = useRef(0);

  useEffect(() => {
    const abort = new AbortController();
    let reading = false;
    async function read() {
      if (reading || pending.current) return;
      reading = true;
      const current = version.current;
      try {
        const response = await fetch(route(ticketId), { signal: abort.signal });
        if (!response.ok) throw new Error();
        const result = await response.json() as PreviewState | null;
        if (!abort.signal.aborted && current === version.current) {
          setPreview(result); setChecked(true); setReadError('');
        }
      } catch {
        if (!abort.signal.aborted && current === version.current) setReadError('Could not check the preview. Trying again.');
      } finally { reading = false; }
    }
    setChecked(false);
    void read();
    const timer = setInterval(() => void read(), 1500);
    return () => { abort.abort(); clearInterval(timer); };
  }, [ticketId]);

  async function act(action: 'start' | 'stop') {
    if (pending.current) return;
    pending.current = true;
    ++version.current;
    setBusy(true); setError('');
    try {
      const response = await fetch(route(ticketId) + '/' + action, { method: 'POST',
        headers: { 'Content-Type': 'application/json' }, body: '{}' });
      const result = await response.json() as (PreviewState & { error?: string }) | null;
      if (!response.ok) throw new Error(result?.error ?? 'Could not ' + action + ' the preview.');
      setPreview(result); setReadError('');
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Preview failed.'); }
    finally { pending.current = false; setBusy(false); }
  }

  const running = preview?.stage === 'ready' || preview?.stage === 'starting';
  return <section aria-label="Preview" aria-busy={busy}>
    <button className="primary" disabled={!checked || !!readError || busy || preview?.stage === 'stopping' || preview?.stage === 'uncertain'}
      onClick={() => void act(running ? 'stop' : 'start')}>
      {running ? 'Stop preview' : 'Preview'}
    </button>
    {!checked && !readError && <p role="status">Checking preview.</p>}
    {preview && <div className="preview-details">
      <p role="status">{stageLabels[preview.stage]}{preview.stage === 'ready' && preview.url
        && <> - <a href={preview.url} target="_blank" rel="noreferrer">Open preview</a></>}</p>
      <p><code>{preview.revision}</code> - {preview.command}{preview.profile && <> - Review workspace {preview.profile}</>}</p>
    </div>}
    {preview?.stage === 'failed' && <p>Check the saved preview command and the ticket worktree, then try again.</p>}
    {preview?.stage === 'uncertain' && <p role="alert">Could not identify the saved preview process. Close the old preview if it is still open.</p>}
    {readError && <p role="status">{readError}</p>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
