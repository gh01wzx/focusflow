import { useEffect, useRef, useState } from 'react';
import type { GitHubStatus, GitHubRepository } from '../../../src/shared/github.ts';
import { createGitHubClient } from '../../../src/client/github.ts';

const client = createGitHubClient();
export function GitHubConnection({ projectId, onRepository }: { projectId: string; onRepository?(value: GitHubRepository | null): void }) {
  const [status, setStatus] = useState<GitHubStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [clientId, setClientId] = useState('');
  const [name, setName] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const mounted = useRef(true);
  const generation = useRef(0);
  const busyRef = useRef(false);
  useEffect(() => { onRepository?.(status?.repository ?? null); }, [status, onRepository]);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; ++generation.current; };
  }, []);
  useEffect(() => {
    let active = true;
    const token = ++generation.current;
    void client.read(projectId).then(value => {
      if (active && mounted.current && token === generation.current && !busyRef.current) {
        setStatus(value); setClientId(value.clientId); setError('');
      }
    }, () => {
      if (active && mounted.current && token === generation.current && !busyRef.current) {
        setError('Could not read GitHub connection. Retry later.');
      }
    });
    return () => { active = false; };
  }, [projectId, refresh]);
  async function act(action: string, value?: unknown) {
    if (busyRef.current) return;
    busyRef.current = true;
    const token = ++generation.current;
    setBusy(true); setError('');
    try {
      const next = await client.act(projectId, action, value);
      if (mounted.current && token === generation.current) { setStatus(next); setConfirmed(false); }
    } catch (failure) {
      if (mounted.current && token === generation.current) {
        setError(failure instanceof Error ? failure.message : 'Could not change GitHub connection.');
      }
    } finally { busyRef.current = false; if (mounted.current) setBusy(false); }
  }
  useEffect(() => {
    if (!status?.userCode || busy) return;
    const timer = setTimeout(() => { void act('poll'); }, Math.max(1000, status.nextPollAt - Date.now()));
    return () => clearTimeout(timer);
  }, [status, busy, projectId]);
  return <details className="github-connection">
    <summary>GitHub connection{status?.repository ? ': ' + status.repository.fullName : ''}</summary>
    <div className="github-body">
      <p className="github-hint">Link this project to its code repository. Connecting creates no Issues, branches or pull requests.</p>
      {error && <div className="error" role="alert">{error}
        <button type="button" className="secondary-button" disabled={busy} onClick={() => setRefresh(value => value + 1)}>Retry connection</button>
      </div>}
      <p className="feedback" role="status" aria-live="polite">{status?.message ?? 'Loading GitHub connection.'}</p>
      {status?.available && <fieldset disabled={busy} aria-busy={busy}>
        <legend className="sr-only">Project repository</legend>
        <div className="github-account-row">
          <p>Account: <strong>{status.account ?? 'Not connected'}</strong></p>
          <span className="github-badge" data-connected={status.connected}>{status.connected ? 'Connected' : 'Not connected'}</span>
        </div>
        {status.repository && <div className="github-linked">
          <span className="github-field-title">Linked repository</span>
          <strong>{status.repository.fullName}</strong>
          <span className="github-visibility">{status.repository.private ? 'Private' : 'Public'}</span>
        </div>}
        {status.connected && <section className="github-repository" aria-label="Choose a repository">
          <div className="github-section-heading">
            <h3>Project repository</h3>
            <button type="button" className="secondary-button" onClick={() => void act('check')}>Check account and repositories</button>
          </div>
          <label htmlFor={'github-repository-' + projectId}>Repository owner/name</label>
          <div className="github-input-row">
            <input id={'github-repository-' + projectId} value={name} maxLength={140} placeholder="owner/repository"
              autoCapitalize="none" spellCheck={false} onChange={event => {
                setName(event.target.value); setConfirmed(false);
                setStatus(current => current ? { ...current, preview: null } : current);
              }} list={'github-repositories-' + projectId} />
            <button type="button" className="secondary-button" disabled={!name.trim()} onClick={() => void act('inspect', { name })}>Inspect repository</button>
          </div>
          <datalist id={'github-repositories-' + projectId}>{status.repositories.map(repo => <option key={repo.id} value={repo.fullName}>{repo.private ? 'Private' : 'Public'}</option>)}</datalist>
          {status.preview && <div className="github-preview">
            <div className="github-section-heading">
              <strong>{status.preview.fullName}</strong>
              <span className="github-visibility">{status.preview.private ? 'Private repository' : 'Public repository'}</span>
            </div>
            <p className="github-hint">Check the full name and visibility before linking this repository.</p>
            <button type="button" className="github-confirm" aria-pressed={confirmed}
              aria-label="I confirm this repository for this project." onClick={() => setConfirmed(value => !value)}>
              <span>{confirmed ? 'Repository confirmed' : 'Confirm this repository for this project'}</span>
              <span className="github-choice-state" aria-hidden="true">{confirmed ? 'Confirmed' : 'Confirm'}</span>
            </button>
            <div className="github-actions">
              <button type="button" className="primary" disabled={!confirmed}
                onClick={() => void act('connect', { confirmed, repositoryId: status.preview!.id })}>Connect repository</button>
            </div>
          </div>}
        </section>}
        <details className="github-settings" open={!status.connected || !!status.userCode}>
          <summary>Connection settings</summary>
          <div className="github-settings-body">
            <label htmlFor={'github-client-' + projectId}>GitHub App client ID</label>
            <input id={'github-client-' + projectId} value={clientId} maxLength={100} autoCapitalize="none" spellCheck={false}
              onChange={event => setClientId(event.target.value)} />
            <p className="github-hint">Use your own GitHub App with device flow enabled and read-only Repository metadata access. No client secret is needed.</p>
            <div className="github-actions">
              {!status.userCode && <button type="button" className="secondary-button" disabled={!clientId.trim()}
                onClick={() => void act('start', { clientId })}>Authorize GitHub</button>}
              <a href="https://github.com/settings/apps" target="_blank" rel="noreferrer">GitHub App settings</a>
            </div>
            {status.userCode && <div className="github-device">
              <p>Device code: <strong>{status.userCode}</strong></p>
              <p className="github-hint">Enter the code at GitHub and review the App name, permissions and repository access.</p>
              <div className="github-actions">
                <a className="secondary-button" href="https://github.com/login/device" target="_blank" rel="noreferrer">Enter code at GitHub</a>
                <button type="button" className="secondary-button" onClick={() => void act('cancel')}>Cancel authorization</button>
              </div>
            </div>}
          </div>
        </details>
        <div className="github-disconnect">
          <button type="button" className="secondary-button github-disconnect-button" onClick={() => void act('disconnect')}>Disconnect this profile</button>
          <p className="github-hint">Removes saved GitHub access and repository links in this profile. Project tasks stay. Revoke remote authorization separately in GitHub App settings.</p>
        </div>
      </fieldset>}
    </div>
  </details>;
}
