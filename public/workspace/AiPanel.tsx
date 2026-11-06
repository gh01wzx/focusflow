import { useEffect, useRef, useState } from 'react';
import { createAiClient } from '../../src/client/ai.ts';
import { AI_SETUP_URL } from '../../src/shared/ai.ts';
import type { AiStatus } from '../../src/shared/ai.ts';

const client = createAiClient();
export function AiPanel({ disabled }: { disabled: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  useEffect(() => {
    if (status?.mode !== 'signing-in') return;
    const timer = setInterval(() => { void client.status().then(next => { if (mounted.current) setStatus(next); }).catch(() => {}); }, 1500);
    return () => clearInterval(timer);
  }, [status?.mode]);
  async function run(operation: () => Promise<AiStatus>) {
    setBusy(true); setError('');
    try { const next = await operation(); if (mounted.current) setStatus(next); }
    catch { if (mounted.current) setError('Could not contact the local AI service. Close and reopen FocusFlow, then retry.'); }
    finally { if (mounted.current) setBusy(false); }
  }
  return <>
    <button className="nav-item ai-entry" disabled={disabled} onClick={() => {
      dialog.current?.showModal(); void run(client.status);
    }}>AI connection</button>
    <dialog className="ai-dialog" ref={dialog} aria-labelledby="ai-title">
      <h2 id="ai-title">AI connection</h2>
      <p>FocusFlow uses the official Codex runtime with a separate ChatGPT sign-in. It does not copy Codex App sessions.</p>
      <p>A model request uses your Codex allowance. Available usage depends on your ChatGPT plan and current limits. FocusFlow never switches to API-key billing.</p>
      {status && <>
        <dl><dt>Runtime</dt><dd>Codex {status.runtimeVersion} / {status.mode}</dd>
          {status.account && <><dt>Account</dt><dd>{status.account}</dd></>}
          {status.plan && <><dt>Plan</dt><dd>{status.plan}</dd></>}
        </dl>
        <p role="status">{status.message}</p>
        {status.signInUrl && <p><a href={status.signInUrl} target="_blank" rel="noreferrer">Continue ChatGPT sign-in in your browser</a></p>}
      </>}
      {error && <p role="alert" className="error">{error}</p>}
      <p><a href={AI_SETUP_URL} target="_blank" rel="noreferrer">Official Codex setup guide</a></p>
      <p>From a FocusFlow source checkout, run <code>npm run ai:install</code> to install the pinned runtime. Setup needs Node 24 and npm. Credentials use the OS credential store; setup fails if that store is unavailable.</p>
      <div className="ai-buttons">
        <button disabled={busy || status?.mode === 'signing-in'} onClick={() => void run(client.check)}>Check account</button>
        <button disabled={busy || status?.mode === 'signing-in'} onClick={() => void run(client.signIn)}>Sign in with ChatGPT</button>
        {status?.mode === 'signing-in' && <button disabled={busy} onClick={() => void run(client.cancel)}>Cancel sign-in</button>}
      </div>
      <label className="ai-consent"><input type="checkbox" checked={confirmed} disabled={busy}
        onChange={event => setConfirmed(event.target.checked)} />I understand that this read-only check uses Codex allowance.</label>
      <button className="primary" disabled={busy || !confirmed || status?.mode !== 'chatgpt'}
        onClick={() => void run(() => client.verify(confirmed))}>Run read-only AI check</button>
      <form method="dialog"><button className="ai-close">Close</button></form>
    </dialog>
  </>;
}
