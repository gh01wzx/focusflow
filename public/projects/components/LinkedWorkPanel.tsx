import { t } from '../../workspace/locale.ts';
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
    }}>{open ? t('Hide linked work') : t('Compare linked work')}</button>
    {open && <div aria-label={t("Linked work comparison")} role="region">
      <p>{t("Local intent stays local. GitHub owns Issue/PR identity and merge evidence. Text changes require an explicit decision.")}</p>
      {error && <p className="error" role="alert">{t(error)}</p>}
      {state && <>
        <p>{t("Last successful refresh:")} {state.lastSuccess ?? t('Never')}</p>
        {state.error && <p className="error" role="alert">{state.error}</p>}
        <p>{t("Local changed:")} {state.localChanged === null ? t('Unknown baseline') : state.localChanged ? t('Yes') : t('No')}{t(". GitHub changed:")} {state.remoteChanged === null ? t('Unknown baseline') : state.remoteChanged ? t('Yes') : t('No')}.</p>
        <p role="status">{state.matches ? t('Local and GitHub fields match.') : t('Fields differ or remote evidence is unavailable. Nothing is overwritten automatically.')}</p>
        <button type="button" className="secondary-button" disabled={busy || editing || disabled} onClick={() => void run('refresh')}>{t("Refresh linked work")}</button>
        <h4>{t("Local ticket")}</h4><p>{state.local.title}</p><p className="project-description">{state.local.description}</p><p className="project-description">{state.local.acceptanceCriteria}</p>
        <h4>{t("GitHub Issue")}</h4>
        {state.remote ? <><p>{state.remote.title}</p><p>{t("Issue state:")} {state.remote.state}{t(". Closing an Issue does not prove a PR merge or complete the ticket.")}</p>
          <pre className="publication-content">{state.remote.body}</pre></> : <p>{t("No successful remote evidence yet.")}</p>}
        <a target="_blank" rel="noreferrer" href={'https://github.com/' + state.repository.fullName + '/issues/' + state.issueNumber}>{t("Open Issue on GitHub")}</a>
        {!editing ? <button type="button" className="secondary-button" disabled={busy || disabled} onClick={() => {
          setFields(state.local); setEditing(true); setConfirmed(false); onLock(true);
        }}>{t("Edit local requirements")}</button> : <form className="project-form" onSubmit={event => {
          event.preventDefault(); void run('edit', { ...decision, fields }).then(saved => { if (saved) { setEditing(false); onLock(false); } });
        }}>
          <label>{t("Local title")}<input required maxLength={300} disabled={busy} value={fields.title} onChange={event => setFields(current => ({ ...current, title: event.target.value }))} /></label>
          <label>{t("Local description")}<textarea maxLength={2000} disabled={busy} value={fields.description} onChange={event => setFields(current => ({ ...current, description: event.target.value }))} /></label>
          <label>{t("Local acceptance criteria")}<textarea maxLength={2000} disabled={busy} value={fields.acceptanceCriteria} onChange={event => setFields(current => ({ ...current, acceptanceCriteria: event.target.value }))} /></label>
          <p>{t("Saving updates only local fields. Edit the Issue explicitly on GitHub if you want the same public text; remote content is preserved here.")}</p>
          <label className="plan-consent"><input type="checkbox" checked={confirmed} disabled={busy} onChange={event => setConfirmed(event.target.checked)} />{t("I confirm these local requirement changes.")}</label>
          <button className="primary" disabled={busy || !confirmed}>{t("Save local requirements")}</button>
          <button type="button" className="secondary-button" disabled={busy} onClick={() => { setEditing(false); setConfirmed(false); onLock(false); }}>{t("Cancel local changes")}</button>
        </form>}
        {!editing && <>
          <label className="plan-consent"><input type="checkbox" checked={confirmed} disabled={busy || disabled}
            onChange={event => setConfirmed(event.target.checked)} />{t("I confirm the current linked-work decision.")}</label>
          <button type="button" className="secondary-button" disabled={!confirmed || busy || disabled || !state.remoteFields} onClick={() => void run('accept-remote', decision)}>{t("Use GitHub fields locally")}</button>
          <label>{t("Pull request number")}<input type="number" min={1} value={pr} disabled={busy || !!state.pullNumber || disabled} onChange={event => { setPr(event.target.value); setConfirmed(false); }} /></label>
          <button type="button" className="secondary-button" disabled={!confirmed || busy || disabled || !pr || !!state.pullNumber}
            onClick={() => void run('link-pr', { ...decision, number: Number(pr) })}>{t("Inspect and link this PR")}</button>
        </>}
        {state.pull && <><h4>{t("Linked pull request #")}{state.pull.number}</h4><p>{state.pull.title}</p><p>{t("Head:")} {state.pull.headSha}</p>
          <p>{state.pull.merged ? t('Merge observed: ') + state.pull.mergeCommitSha : state.pull.state === 'closed' ? t('Closed without merge') : t('Open - not merged')}.</p>
          <p>{t("This comparison does not change ticket status or start work.")}</p>
          <a target="_blank" rel="noreferrer" href={'https://github.com/' + state.repository.fullName + '/pull/' + state.pull.number}>{t("Open linked PR")}</a></>}
      </>}
    </div>}
  </section>;
}
