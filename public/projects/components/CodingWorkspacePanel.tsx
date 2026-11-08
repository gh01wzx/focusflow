import { useEffect, useState } from 'react';
import { createCodingClient } from '../../../src/client/execution.ts';
import type { WorkspaceState } from '../../../src/shared/execution.ts';

const api = createCodingClient();
export function CodingWorkspacePanel({ ticketId, disabled, onLock }: { ticketId: string; disabled: boolean; onLock(value: boolean): void }) {
  const [state, setState] = useState<WorkspaceState | null>(null);
  const [sourcePath, setSourcePath] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { let current = true; void api.read(ticketId).then(value => { if (current) { setState(value); setSourcePath(value.workspace?.sourcePath ?? ''); } }, () => { if (current) setError('Could not read the coding workspace.'); }); return () => { current = false; }; }, [ticketId]);
  useEffect(() => { onLock(busy); return () => onLock(false); }, [busy,onLock]);
  async function act(action: string) {
    if (busy) return;
    setBusy(true); setError('');
    try { setState(await api.act(ticketId, action, { sourcePath, confirm, headSha: state?.inspection?.headSha })); setConfirm(false); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Repository preparation failed.'); }
    finally { setBusy(false); }
  }
  return <section className="coding-workspace" aria-label="Coding workspace">
    <h3>Local coding workspace</h3>
    <p>Choose the connected repository on this computer. Inspection reads Git metadata; preparing creates a separate worktree without resetting your original files.</p>
    {error && <p role="alert" className="error">{error}</p>}
    <label>Local repository folder<input value={sourcePath} maxLength={2000} disabled={busy || disabled || state?.workspace?.state === 'ready'}
      onChange={event => { setSourcePath(event.target.value); setConfirm(false); setState(current => current ? { ...current, inspection: null } : null); }} placeholder="C:\Projects\my-project" /></label>
    <button disabled={busy || disabled || !sourcePath.trim()} onClick={() => void act('inspect')}>Inspect repository</button>
    {state?.inspection && <div>
      <p>{state.inspection.repository.fullName} / {state.inspection.branch || 'Detached revision'}</p>
      <p>Base commit: <code>{state.inspection.headSha}</code></p>
      <p>{state.inspection.notice}</p>
      <label><input type="checkbox" checked={confirm} disabled={busy || disabled} onChange={event => setConfirm(event.target.checked)} />Prepare a separate coding workspace from this commit.</label>
      <button disabled={busy || disabled || !confirm} onClick={() => void act('prepare')}>Prepare workspace</button>
    </div>}
    {state?.workspace && <div><p>{state.workspace.message}</p><p>Branch: <code>{state.workspace.branch}</code></p><p>Workspace: <code>{state.workspace.workspacePath}</code></p></div>}
  </section>;
}
