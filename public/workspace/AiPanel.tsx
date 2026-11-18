import { t } from './locale.ts';
import { useEffect, useRef, useState } from 'react';
import { createAiClient } from '../../src/client/ai.ts';
import { AI_SETUP_URL, DSH_VERSION, apiEndpoints } from '../../src/shared/ai.ts';
import type { ApiProvider, AiProvider, AiStatus, DshStatus } from '../../src/shared/ai.ts';

const client = createAiClient();
export function AiPanel({ disabled }: { disabled: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [provider, setProvider] = useState<AiProvider>('openai');
  const [dsh, setDsh] = useState<DshStatus | null>(null);
  const [key, setKey] = useState('');

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
    catch (error) { if (mounted.current) setError(error instanceof Error ? error.message : 'Could not contact DeepSeek.'); }
    finally { if (mounted.current) setDshBusy(false); }
  }
  function choose(next: AiProvider) {
    setKey(''); setError(''); setConfirmed(false); setDshConfirmed(false);
    setProvider(next);
    if (next === 'codex') void run(client.status);
    if (next === 'dsh') void runDsh(client.dshStatus);
  }
  return <>
    <button className="nav-item ai-entry" disabled={disabled} onClick={() => {
      setConfirmed(false); setDshConfirmed(false); setOpen(true); dialog.current?.showModal();
      if (provider === 'codex') void run(client.status);
      else if (provider === 'dsh') void runDsh(client.dshStatus);
    }}>{t("AI connection")}</button>
    <dialog className="ai-dialog" ref={dialog} onClose={() => { setOpen(false); setKey(''); setError(''); }} aria-labelledby="ai-title">
      <h2 id="ai-title">{t("AI connection")}</h2>
      <div className="ai-buttons" role="group" aria-label={t("AI provider")}>
        {([['openai','OpenAI / Codex'], ['claude','Claude'], ['deepseek','DeepSeek'], ['compatible','Compatible API']] as const).map(([id,label]) =>
          <button key={id} disabled={busy || dshBusy} aria-pressed={provider === id || (id === 'openai' && provider === 'codex') || (id === 'deepseek' && provider === 'dsh')}
            onClick={() => choose(id)}>{t(label)}</button>)}
      </div>
      {(provider === 'openai' || provider === 'codex') && <div className="ai-buttons" aria-label={t("Connection method")}>
        <button disabled={busy} aria-pressed={provider === 'codex'} onClick={() => choose('codex')}>{t("ChatGPT sign-in")}</button>
        <button disabled={busy} aria-pressed={provider === 'openai'} onClick={() => choose('openai')}>OpenAI API</button>
      </div>}
      {(provider === 'deepseek' || provider === 'dsh') && <div className="ai-buttons" aria-label={t("Connection method")}>
        <button disabled={dshBusy} aria-pressed={provider === 'deepseek'} onClick={() => choose('deepseek')}>DeepSeek API</button>
        <button disabled={dshBusy} aria-pressed={provider === 'dsh'} onClick={() => choose('dsh')}>DeepSeek Harness</button>
      </div>}
      {provider === 'codex' ? <>
      <p>{t("FocusFlow uses the official Codex runtime with a separate ChatGPT sign-in. It does not copy Codex App sessions.")}</p>
      <p>{t("A model request uses your Codex allowance. Available usage depends on your ChatGPT plan and current limits. FocusFlow never switches to API-key billing.")}</p>
      {status && <>
        <dl><dt>{t("Runtime")}</dt><dd>Codex {status.runtimeVersion} / {t(status.mode)}</dd>
          {status.account && <><dt>{t("Account")}</dt><dd>{status.account}</dd></>}
          {status.plan && <><dt>{t("Plan")}</dt><dd>{status.plan}</dd></>}
        </dl>
        <p role="status">{t(status.message)}</p>
        {status.signInUrl && <p><a href={status.signInUrl} target="_blank" rel="noreferrer">{t("Continue ChatGPT sign-in in your browser")}</a></p>}
      </>}
      <p><a href={AI_SETUP_URL} target="_blank" rel="noreferrer">{t("Official Codex setup guide")}</a></p>
      <p>{t("From a FocusFlow source checkout, run")} <code>npm run ai:install</code> {t("to install the pinned runtime. Setup needs Node 24 and npm. Credentials use the OS credential store; setup fails if that store is unavailable.")}</p>
      <div className="ai-buttons">
        <button disabled={busy || status?.mode === 'signing-in'} onClick={() => void run(client.check)}>{t("Check account")}</button>
        <button disabled={busy || status?.mode === 'signing-in'} onClick={() => void run(client.signIn)}>{t("Sign in with ChatGPT")}</button>
        {status?.mode === 'signing-in' && <button disabled={busy} onClick={() => void run(client.cancel)}>{t("Cancel sign-in")}</button>}
      </div>
      <label className="ai-consent"><input type="checkbox" checked={confirmed} disabled={busy}
        onChange={event => setConfirmed(event.target.checked)} />{t("I understand that this read-only check uses Codex allowance.")}</label>
      <button className="primary" disabled={busy || !confirmed || status?.mode !== 'chatgpt'}
        onClick={() => void run(() => client.verify(confirmed))}>{t("Run read-only AI check")}</button>
      </> : provider === 'dsh' ? <>
        <p>{t("Connect DeepSeek Harness to FocusFlow. Model requests use your DeepSeek API balance.")}</p>
        <p>{t("Install the CLI with")} <code>npm install -g @deepseek-ai/dsh@{DSH_VERSION}</code>.</p>
        <form onSubmit={event => {
          event.preventDefault();
          const submitted = key;
          setKey('');
          void runDsh(() => client.saveDshKey(submitted));
        }}>
          <label>{t("DeepSeek API key")} <input type="password" autoComplete="off" value={key} onChange={event => setKey(event.target.value)} /></label>
          <button className="primary" disabled={!key.trim() || dshBusy}>{t("Save on this computer")}</button>
        </form>
        <p role="status">{dsh && t(dsh.message)}</p>
        <button disabled={dshBusy} onClick={() => void runDsh(client.dshCheck)}>{t("Check DeepSeek Harness")}</button>
        <label className="ai-consent"><input type="checkbox" checked={dshConfirmed} disabled={dshBusy || !dsh?.ready}
          onChange={event => setDshConfirmed(event.target.checked)} />{t("I understand that this check uses my DeepSeek API balance.")}</label>
        <button className="primary" disabled={dshBusy || !dshConfirmed || !dsh?.ready}
          onClick={() => void runDsh(() => client.dshVerify(dshConfirmed))}>{t("Run read-only DeepSeek check")}</button>
      </> : open && <ApiForm key={provider} provider={provider} />}
      {error && <p role="alert" className="error">{t(error)}</p>}
      <form method="dialog"><button className="ai-close">{t("Close")}</button></form>
    </dialog>
  </>;
}

function ApiForm({provider}: {provider: ApiProvider}) {
  const fixed = provider !== 'compatible';
  const [endpoint,setEndpoint] = useState(fixed ? apiEndpoints[provider] : '');
  const [key,setKey] = useState('');
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState('');
  const [loading,setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    void client.compatibleStatus(provider).then(status => {
      if (!active) return;
      if (!fixed) setEndpoint(status.endpoint);
      if (status.connected) setMessage('Connected');
    }).catch(() => { if (active) setMessage('Could not read connection.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [fixed,provider]);
  return <form className="project-form" onSubmit={async event => {
    event.preventDefault(); if (busy || loading) return;
    setBusy(true); setMessage(''); const secret = key; setKey('');
    try { await client.saveCompatible(endpoint,secret,provider); setMessage('Connected'); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Could not save connection.'); }
    finally { setBusy(false); }
  }}>
    {fixed ? <p>{endpoint}</p> : <label>{t("API base URL")}<input required disabled={busy || loading} value={endpoint} onChange={e => setEndpoint(e.target.value)} /></label>}
    <label>{t("API key")}<input required={fixed} type="password" autoComplete="off" value={key} disabled={busy || loading} onChange={e => setKey(e.target.value)} /></label>
    <button className="primary" disabled={loading || busy || !endpoint || (fixed && !key.trim())}>{t("Connect and save")}</button>
    <p role="status">{t(message)}</p>
  </form>;
}
