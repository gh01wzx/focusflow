import { useState } from 'react';
import { issueBody, issueTitle } from '../../../src/shared/publication.ts';
import type { PublicationBatch } from '../../../src/shared/publication.ts';
import type { GitHubRepository } from '../../../src/shared/github.ts';
import { defaultAiModelSelection } from '../../../src/shared/ai.ts';
import type { AiModelSelection } from '../../../src/shared/ai.ts';
import { ModelPicker } from './ModelPicker.tsx';

interface RunDetails { scope: string; batch: PublicationBatch | null; destination: GitHubRepository; headSha: string; estimate: number; budget: number; selection?: AiModelSelection }
export function QuickRunPanel({ ticketId, onChanged, onBusy }: { ticketId: string; onChanged(): void; onBusy(value: boolean): void }) {
  const [details, setDetails] = useState<RunDetails>();
  const [selection, setSelection] = useState(defaultAiModelSelection);
  const [files, setFiles] = useState('');
  const [modelReady, setModelReady] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function act(action: 'details' | 'start') {
    setBusy(true); onBusy(true); setError('');
    try {
      const response = await fetch('/api/project-tickets/' + ticketId + '/quick-run/' + action, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(action === 'details' ? {}
          : { scope: details?.scope, batchId: details?.batch?.id, selection, files, confirm: true }),
      });
      const result = await response.json() as RunDetails & { error?: string };
      if (!response.ok) throw new Error(result.error ?? 'Could not start this ticket.');
      if (action === 'details') {
        if (!details) setSelection(result.selection ?? defaultAiModelSelection);
        setDetails(result);
      }
      else { setDetails(undefined); setModelReady(false); onChanged(); }
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not start.'); }
    finally { setBusy(false); onBusy(false); }
  }
  const content = details?.batch?.items[0]?.content;
  return <div className="quick-run">
    {error && <p role="alert">{error}</p>}
    {!details ? <button className="primary" disabled={busy} onClick={() => void act('details')}>Run coding ticket</button> : <>
      <dl className="run-scope">
        <div><dt>Repository</dt><dd>{details.destination.fullName}</dd></div>
        <div><dt>Visibility</dt><dd>{details.destination.private ? 'Private' : 'Public'}</dd></div>
        <div><dt>Base commit</dt><dd><code>{details.headSha.slice(0, 12)}</code></dd></div>
      </dl>
      {content && <details open><summary>Issue to publish</summary><strong>{issueTitle(content)}</strong><pre className="ticket-result">{issueBody(content)}</pre></details>}
      <ModelPicker value={selection} onChange={setSelection} onReadyChange={setModelReady} disabled={busy} />
      {selection.provider !== 'codex' && <label>Tracked files to edit<textarea value={files} maxLength={6000}
        onChange={event => setFiles(event.target.value)} placeholder="One relative path per line" /></label>}
      <p>Uses {selection.provider === 'codex' ? 'ChatGPT Codex allowance' : 'the selected API balance'}. Ticket and project notes are roughly {details.estimate.toLocaleString()} input tokens before runtime context.</p>
      {selection.provider === 'codex' && details.budget > 0 && <p>Stop after {details.budget.toLocaleString()} reported tokens.</p>}
      <button className="primary" disabled={busy || !modelReady || selection.provider !== 'codex' && !files.trim()} onClick={() => void act('start')}>{content ? 'Publish Issue and run' : 'Start'}</button>
      {error && <button className="quiet-button" disabled={busy} onClick={() => void act('details')}>Refresh run details</button>}
      <button className="quiet-button" disabled={busy} onClick={() => { setDetails(undefined); setModelReady(false); setError(''); }}>Cancel</button>
    </>}
  </div>;
}
