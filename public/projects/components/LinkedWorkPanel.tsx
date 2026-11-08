import { useEffect, useRef, useState } from 'react';
import { createLinkedWorkClient } from '../../../src/client/linked-work.ts';
import type { LinkedWorkState, LinkedFields } from '../../../src/shared/linked-work.ts';

const client = createLinkedWorkClient();
export function LinkedWorkPanel({ ticketId, disabled, onLock, onChanged }: {
  ticketId: string; disabled: boolean; onLock(locked: boolean): void; onChanged(): void;
}) {
  const [open, setOpen] = useState(false), [state, setState] = useState<LinkedWorkState | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [editing, setEditing] = useState(false);
  const [fields, setFields] = useState<LinkedFields>({ title: '', description: '', acceptanceCriteria: '' });
  const [confirmed, setConfirmed] = useState(false), [pr, setPr] = useState('');
  const mounted = useRef(true), owned = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  async function run(action?: string, input?: unknown) {
    if (owned.current) return false;
    owned.current = true; setBusy(true); setError(''); setConfirmed(false); onLock(true);
    try {
      const next = action ? await client.act(ticketId, action, input) : await client.read(ticketId);
      if (!mounted.current) return false;
      setState(next); onChanged(); return true;
    } catch (failure) { if (mounted.current) setError(failure instanceof Error ? failure.message : 'Could not read linked work.'); return false; }
    finally { owned.current = false; if (mounted.current) { setBusy(false); onLock(editing); } }
  }
  const decision = { token: state?.token, confirm: confirmed };
  return <section className="linked-work">
    <button type="button" className="secondary-button" disabled={disabled || busy || editing} onClick={() => {
      setOpen(current => !current); if (!open) void run();
    }}>{open ? 'Hide linked work' : 'Compare linked work'}</button>
    {open && <div aria-label="Linked work comparison" role="region">
      <p>Local intent stays local. GitHub owns Issue/PR identity and merge evidence. Text changes require an explicit decision.</p>
      {error && <p className="error" role="alert">{error}</p>}
      {state && <>
        <p>Last successful refresh: {state.lastSuccess ?? 'Never'}</p>
        {state.error && <p className="error" role="alert">{state.error}</p>}
        <p>Local changed: {state.localChanged === null ? 'Unknown baseline' : state.localChanged ? 'Yes' : 'No'}. GitHub changed: {state.remoteChanged === null ? 'Unknown baseline' : state.remoteChanged ? 'Yes' : 'No'}.</p>
        <p role="status">{state.matches ? 'Local and GitHub fields match.' : 'Fields differ or remote evidence is unavailable. Nothing is overwritten automatically.'}</p>
        <button type="button" className="secondary-button" disabled={busy || editing || disabled} onClick={() => void run('refresh')}>Refresh linked work</button>
        <h4>Local ticket</h4><p>{state.local.title}</p><p className="project-description">{state.local.description}</p><p className="project-description">{state.local.acceptanceCriteria}</p>
        <h4>GitHub Issue</h4>
        {state.remote ? <><p>{state.remote.title}</p><p>Issue state: {state.remote.state}. Closing an Issue does not prove a PR merge or complete the ticket.</p>
          <pre className="publication-content">{state.remote.body}</pre></> : <p>No successful remote evidence yet.</p>}
        <a target="_blank" rel="noreferrer" href={'https://github.com/' + state.repository.fullName + '/issues/' + state.issueNumber}>Open Issue on GitHub</a>
        {!editing ? <button type="button" className="secondary-button" disabled={busy || disabled} onClick={() => {
          setFields(state.local); setEditing(true); setConfirmed(false); onLock(true);
        }}>Edit local requirements</button> : <form className="project-form" onSubmit={event => {
          event.preventDefault(); void run('edit', { ...decision, fields }).then(saved => { if (saved) { setEditing(false); onLock(false); } });
        }}>
          <label>Local title<input required maxLength={300} disabled={busy} value={fields.title} onChange={event => setFields(current => ({ ...current, title: event.target.value }))} /></label>
          <label>Local description<textarea maxLength={2000} disabled={busy} value={fields.description} onChange={event => setFields(current => ({ ...current, description: event.target.value }))} /></label>
          <label>Local acceptance criteria<textarea maxLength={2000} disabled={busy} value={fields.acceptanceCriteria} onChange={event => setFields(current => ({ ...current, acceptanceCriteria: event.target.value }))} /></label>
          <p>Saving updates only local fields. Edit the Issue explicitly on GitHub if you want the same public text; remote content is preserved here.</p>
          <label className="plan-consent"><input type="checkbox" checked={confirmed} disabled={busy} onChange={event => setConfirmed(event.target.checked)} />I confirm these local requirement changes.</label>
          <button className="primary" disabled={busy || !confirmed}>Save local requirements</button>
          <button type="button" className="secondary-button" disabled={busy} onClick={() => { setEditing(false); setConfirmed(false); onLock(false); }}>Cancel local changes</button>
        </form>}
        {!editing && <>
          <label className="plan-consent"><input type="checkbox" checked={confirmed} disabled={busy || disabled}
            onChange={event => setConfirmed(event.target.checked)} />I confirm the current linked-work decision.</label>
          <button type="button" className="secondary-button" disabled={!confirmed || busy || disabled || !state.remoteFields} onClick={() => void run('accept-remote', decision)}>Use GitHub fields locally</button>
          <label>Pull request number<input type="number" min={1} value={pr} disabled={busy || !!state.pullNumber || disabled} onChange={event => { setPr(event.target.value); setConfirmed(false); }} /></label>
          <button type="button" className="secondary-button" disabled={!confirmed || busy || disabled || !pr || !!state.pullNumber}
            onClick={() => void run('link-pr', { ...decision, number: Number(pr) })}>Inspect and link this PR</button>
        </>}
        {state.pull && <><h4>Linked pull request #{state.pull.number}</h4><p>{state.pull.title}</p><p>Head: {state.pull.headSha}</p>
          <p>{state.pull.merged ? 'Merge observed: ' + state.pull.mergeCommitSha : state.pull.state === 'closed' ? 'Closed without merge' : 'Open - not merged'}.</p>
          <p>This comparison does not change ticket status or start work.</p>
          <a target="_blank" rel="noreferrer" href={'https://github.com/' + state.repository.fullName + '/pull/' + state.pull.number}>Open linked PR</a></>}
      </>}
    </div>}
  </section>;
}
