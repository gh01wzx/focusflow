import { useEffect, useRef, useState } from 'react';
import { createAiClient } from '../../src/client/ai.ts';
import { AI_SETUP_URL, DSH_VERSION } from '../../src/shared/ai.ts';
import type { AiProvider, AiStatus, DshStatus } from '../../src/shared/ai.ts';

const client = createAiClient();
export function AiPanel({ disabled }: { disabled: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [provider, setProvider] = useState<AiProvider>('codex');
  const [dsh, setDsh] = useState<DshStatus | null>(null);
  const [dshBusy, setDshBusy] = useState(false);
  const [dshConfirmed, setDshConfirmed] = useState(false);
  const mounted = useRef(true);
  const generation = useRef(0);
  const busyRef = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; ++generation.current; };
  }, []);
  useEffect(() => {
    if (status?.mode !== 'signing-in') return;
    let active = true;
    let polling = false;
    const timer = setInterval(() => {
      if (polling || busyRef.current) return;
      polling = true;
      const token = generation.current;
      void client.status().then(next => {
        if (active && mounted.current && token === generation.current && !busyRef.current) setStatus(next);
      }).catch(() => {}).finally(() => { polling = false; });
    }, 1500);
    return () => { active = false; clearInterval(timer); };
  }, [status?.mode]);
  async function run(operation: () => Promise<AiStatus>) {
    if (busyRef.current) return;
    busyRef.current = true;
    const token = ++generation.current;
    setBusy(true); setError(''); setConfirmed(false);
    try { const next = await operation(); if (mounted.current && token === generation.current) setStatus(next); }
    catch { if (mounted.current) setError('Could not contact the local AI service. Close and reopen FocusFlow, then retry.'); }
    finally { busyRef.current = false; if (mounted.current) setBusy(false); }
  }
  async function runDsh(operation: () => Promise<DshStatus>) {
    if (dshBusy) return;
    setDshBusy(true); setDshConfirmed(false); setError('');
    try { const next = await operation(); if (mounted.current) setDsh(next); }
    catch { if (mounted.current) setError('Could not contact the local DeepSeek Harness service.'); }
    finally { if (mounted.current) setDshBusy(false); }
  }
  return <>
    <button className="nav-item ai-entry" disabled={disabled} onClick={() => {
      setConfirmed(false); setDshConfirmed(false); dialog.current?.showModal();
      if (provider === 'codex') void run(client.status);
      else void runDsh(client.dshStatus);
    }}>AI connection</button>
    <dialog className="ai-dialog" ref={dialog} aria-labelledby="ai-title">
      <h2 id="ai-title">AI connection</h2>
      <div className="ai-buttons" role="group" aria-label="AI provider">
        <button aria-pressed={provider === 'codex'} disabled={busy || dshBusy} onClick={() => {
          setProvider('codex'); void run(client.status);
        }}>Codex</button>
        <button aria-pressed={provider === 'dsh'} disabled={busy || dshBusy} onClick={() => {
          setProvider('dsh'); setConfirmed(false); void runDsh(client.dshStatus);
        }}>DeepSeek Harness</button>
      </div>
      {provider === 'codex' ? <>
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
      </> : <>
        <p>Connect DeepSeek Harness to FocusFlow. Model requests use your DeepSeek API balance.</p>
        <p>Install the CLI with <code>npm install -g @deepseek-ai/dsh@{DSH_VERSION}</code>. Set <code>DEEPSEEK_API_KEY</code> in the environment used to launch FocusFlow, then reopen it.</p>
        <p role="status">{dsh?.message}</p>
        <button disabled={dshBusy} onClick={() => void runDsh(client.dshCheck)}>Check DeepSeek Harness</button>
        <label className="ai-consent"><input type="checkbox" checked={dshConfirmed} disabled={dshBusy || !dsh?.ready}
          onChange={event => setDshConfirmed(event.target.checked)} />I understand that this check uses my DeepSeek API balance.</label>
        <button className="primary" disabled={dshBusy || !dshConfirmed || !dsh?.ready}
          onClick={() => void runDsh(() => client.dshVerify(dshConfirmed))}>Run read-only DeepSeek check</button>
      </>}
      {error && <p role="alert" className="error">{error}</p>}
      <form method="dialog"><button className="ai-close">Close</button></form>
    </dialog>
  </>;
}
