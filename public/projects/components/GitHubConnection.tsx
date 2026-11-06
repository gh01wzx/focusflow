import { useEffect, useState } from 'react';
import type { GitHubStatus } from '../../../src/shared/github.ts';
import { createGitHubClient } from '../../../src/client/github.ts';

const client = createGitHubClient();
export function GitHubConnection({ projectId }: { projectId: string }) {
  const [status, setStatus] = useState<GitHubStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [clientId, setClientId] = useState('');
  const [name, setName] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let active = true;
    void client.read(projectId).then(value => { if (active) { setStatus(value); setClientId(value.clientId); setError(''); } },
      () => { if (active) setError('Could not read GitHub connection. Retry later.'); });
    return () => { active = false; };
  }, [projectId, refresh]);
  async function act(action: string, value?: unknown) {
    setBusy(true); setError('');
    try { setStatus(await client.act(projectId, action, value)); setConfirmed(false); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not change GitHub connection.'); }
    finally { setBusy(false); }
  }
  useEffect(() => {
    if (!status?.userCode || busy) return;
    const timer = setTimeout(() => { void act('poll'); }, Math.max(1000, status.nextPollAt - Date.now()));
    return () => clearTimeout(timer);
  }, [status, busy, projectId]);
  return <details className="github-connection">
    <summary>GitHub connection{status?.repository ? ': ' + status.repository.fullName : ''}</summary>
    <p>Choose where future coding work belongs. Connecting creates no Issues, branches or pull requests.</p>
    {error && <p role="alert">{error} <button disabled={busy} onClick={() => setRefresh(value => value + 1)}>Retry connection</button></p>}
    <p role="status">{status?.message ?? 'Loading GitHub connection.'}</p>
    {status?.available && <fieldset disabled={busy}>
      <legend>Project repository</legend>
      <p>Account: {status.account ?? 'Not connected'}</p>
      {status.repository && <p>Linked: <strong>{status.repository.fullName}</strong> ({status.repository.private ? 'Private' : 'Public'})</p>}
      <label>GitHub App client ID <input value={clientId} maxLength={100} onChange={event => setClientId(event.target.value)} /></label>
      <p>Register your own GitHub App with device flow enabled. Start with read-only Repository metadata; select repositories at GitHub. No client secret is needed.</p>
      <a href="https://github.com/settings/apps" target="_blank" rel="noreferrer">GitHub App settings</a>
      {!status.userCode && <button onClick={() => void act('start', { clientId })}>Authorize GitHub</button>}
      {status.userCode && <div><p>Device code: <strong>{status.userCode}</strong></p>
        <a href="https://github.com/login/device" target="_blank" rel="noreferrer">Enter code at GitHub</a>
        <p>Review the App name, permissions and repository access before approving.</p>
        <button onClick={() => void act('cancel')}>Cancel authorization</button></div>}
      {status.connected && <>
        <button onClick={() => void act('check')}>Check account and repositories</button>
        <label>Repository owner/name <input value={name} maxLength={140} onChange={event => {
          setName(event.target.value); setConfirmed(false);
          setStatus(current => current ? { ...current, preview: null } : current);
        }} list={'github-repositories-' + projectId} /></label>
        <datalist id={'github-repositories-' + projectId}>{status.repositories.map(repo => <option key={repo.id} value={repo.fullName}>{repo.private ? 'Private' : 'Public'}</option>)}</datalist>
        <button onClick={() => void act('inspect', { name })}>Inspect repository</button>
        {status.preview && <div className="github-preview">
          <p><strong>{status.preview.fullName}</strong> - {status.preview.private ? 'Private repository' : 'Public repository'}</p>
          <label><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />I confirm this repository for this project.</label>
          <button disabled={!confirmed} onClick={() => void act('connect', { confirmed, repositoryId: status.preview!.id })}>Connect repository</button>
        </div>}
      </>}
      <button onClick={() => void act('disconnect')}>Disconnect this profile</button>
      <p>Disconnect removes local credentials and all repository links in this data profile. Project tasks remain. To revoke remote authorization, use GitHub App settings.</p>
    </fieldset>}
  </details>;
}
