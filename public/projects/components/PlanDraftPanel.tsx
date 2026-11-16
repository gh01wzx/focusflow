import { useEffect, useState } from 'react';
import { ProjectDialog } from './ProjectDialog.tsx';
import { usePlanController } from '../usePlanController.ts';
import { PlanDraftEditor, PlanApprovalPreview } from './PlanDraftEditor.tsx';
import { createAiClient } from '../../../src/client/ai.ts';
import { aiProviderNames, defaultAiModelSelection, supportsSelection } from '../../../src/shared/ai.ts';
import type { AiConnection, AiModel, AiModelSelection, AiProvider } from '../../../src/shared/ai.ts';

const ai = createAiClient();

export function PlanDraftPanel({ projectId, disabled, onOpenChange, onApproved }: {
  projectId: string; disabled: boolean; onOpenChange(open: boolean): void; onApproved(): void;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'view' | 'edit' | 'preview'>('view');
  const [selection, setSelection] = useState<AiModelSelection>(defaultAiModelSelection);
  const [connections, setConnections] = useState<AiConnection[] | null>(null);
  const [catalog, setCatalog] = useState<{ provider: AiProvider; models: AiModel[] } | null>(null);
  const [revision, refresh] = useState(0);
  const [connectionError, setConnectionError] = useState('');
  const [modelError, setModelError] = useState('');
  const state = usePlanController(projectId, open);
  const connected = connections?.filter(item => item.connected) ?? [];
  const provider = connected.find(item => item.provider === selection.provider)?.provider ?? connected[0]?.provider;
  const models = catalog && catalog.provider === provider ? catalog.models : [];
  const model = models.find(option => option.id === selection.model);
  const choosing = state.busy || !!state.state?.busy || mode !== 'view';
  const canGenerate = !choosing && !!state.state && !!provider && !!model && selection.provider === provider
    && state.confirmed && !!state.goal.trim();

  useEffect(() => {
    if (!open) return;
    const request = new AbortController();
    void ai.connections(request.signal).then(list => {
      if (!request.signal.aborted) setConnections(list);
    }).catch(() => {
      if (!request.signal.aborted) setConnectionError('Could not read AI connections. Close and reopen this dialog to retry.');
    });
    return () => request.abort();
  }, [open]);

  useEffect(() => {
    if (!open || !provider) return;
    const request = new AbortController();
    void ai.models(provider, request.signal).then(models => {
      if (request.signal.aborted) return;
      setCatalog({ provider, models });
      setSelection(previous => previous.provider === provider && supportsSelection(models, previous) ? previous
        : { provider, model: models[0]?.id ?? '', effort: '' });
      if (!models.length) setModelError('The connected provider returned no text models.');
    }).catch(error => {
      if (!request.signal.aborted) setModelError(error instanceof Error ? error.message : 'Could not load models.');
    });
    return () => request.abort();
  }, [open, provider, revision]);

  function resetCatalog() {
    setCatalog(null); setModelError(''); state.setConfirmed(false);
  }
  function choose(next: AiModelSelection) {
    setSelection(next);
    state.setConfirmed(false);
  }
  const draft = state.state?.draft;
  const titles = new Map(draft?.plan.milestones.flatMap(milestone => milestone.tickets.map(ticket => [ticket.key, ticket.title] as const)));
  function close() {
    if (state.state?.busy) void state.cancel();
    setOpen(false); onOpenChange(false);
  }
  const buttonId = 'plan-draft-' + projectId;
  return <>
    <button id={buttonId} className="secondary-button" disabled={disabled} onClick={() => {
      setConnections(null); setConnectionError(''); resetCatalog();
      setOpen(true); onOpenChange(true);
    }}>AI plan draft</button>
    {open && <ProjectDialog title="AI plan draft" locked={state.busy || mode !== 'view'} returnFocusId={buttonId} onClose={close}>
      <p className="plan-notice">Suggestions stay private until you preview and approve the selected plan. Approval never starts work or publishes GitHub Issues.</p>
      {connectionError && <p role="alert" className="error">{connectionError}</p>}
      {!connections && !connectionError && <p role="status">Checking AI connections.</p>}
      {connections && !provider && <p role="status">Connect a provider in AI connection to generate a draft.</p>}
      {provider && <form className="project-form" onSubmit={event => { event.preventDefault(); if (canGenerate) void state.generate(selection); }}>
        <p>FocusFlow sends your goal as text through {aiProviderNames[provider]}.</p>
        <label htmlFor="plan-provider">Provider</label>
        <select id="plan-provider" value={provider} disabled={choosing} onChange={event => {
          const next = connected.find(item => item.provider === event.target.value);
          if (!next) return;
          resetCatalog();
          choose({ provider: next.provider, model: '', effort: '' });
        }}>
          {connected.map(item => <option key={item.provider} value={item.provider}>{aiProviderNames[item.provider]}</option>)}
        </select>
        <label htmlFor="plan-model">Model</label>
        <div className="plan-actions">
          <select id="plan-model" value={model?.id ?? ''} disabled={choosing || !models.length}
            onChange={event => choose({ provider, model: event.target.value, effort: '' })}>
            {!models.length && <option value="">{modelError ? 'No models loaded' : 'Loading models'}</option>}
            {models.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
          </select>
          <button type="button" className="secondary-button" disabled={choosing || (!catalog && !modelError)}
            onClick={() => { resetCatalog(); refresh(count => count + 1); }}>Refresh models</button>
        </div>
        {modelError && <p role="alert" className="error">{modelError}</p>}
        <label htmlFor="plan-effort">Reasoning effort</label>
        <select id="plan-effort" value={model ? selection.effort : ''} disabled={choosing || !model?.efforts.length}
          onChange={event => choose({ ...selection, effort: event.target.value })}>
          <option value="">{model?.defaultEffort ? `Default (${model.defaultEffort})` : 'Provider default'}</option>
          {model?.efforts.map(effort => <option key={effort} value={effort}>{effort}</option>)}
        </select>
        <label htmlFor="plan-goal">Project goal</label>
        <textarea id="plan-goal" rows={4} maxLength={3000} value={state.goal}
          disabled={state.busy || state.state?.busy || mode !== 'view'} onChange={event => state.setGoal(event.target.value)} />
        <label className="plan-consent"><input type="checkbox" checked={state.confirmed} disabled={choosing || !model}
          onChange={event => state.setConfirmed(event.target.checked)} />I understand that generating this draft uses {
            provider === 'codex' ? 'Codex allowance' : 'my DeepSeek API balance'}.</label>
        <p>The previous saved draft stays available until a valid replacement is saved. Reopening a draft does not call a model.</p>
        <div className="plan-actions">
          <button className="primary" disabled={!canGenerate}>Generate draft</button>
          {state.state?.busy && <button type="button" className="secondary-button" disabled={state.busy || state.state.cancelling}
            onClick={() => void state.cancel()}>Cancel generation</button>}
        </div>
      </form>}
      <p className="feedback" role="status" aria-live="polite">{state.state?.message || (state.busy ? 'Opening the saved draft.' : '')}</p>
      {state.error && <p className="error" role="alert">{state.error}</p>}
      {draft && mode === 'edit' && <PlanDraftEditor key={draft.revision ?? draft.id} draft={draft} busy={state.busy}
        onSave={state.save} onCancel={() => setMode('view')} />}
      {draft && mode === 'preview' && <PlanApprovalPreview draft={draft} busy={state.busy} onApprove={async confirmed => {
        const saved = await state.approve(draft, confirmed); if (saved) onApproved(); return saved;
      }} onCancel={() => setMode('view')} />}
      {draft && <section className="plan-draft" aria-label="Saved AI draft">
        <h3>Saved draft</h3>
        <p>Goal: {draft.goal}</p>
        {state.state?.approval ? <p role="status">Plan approved: {state.state.approval.ticketIds.length} saved tasks. Nothing started. Coding tasks remain unpublished.</p>
          : <div className="plan-actions">
            <button type="button" className="secondary-button" disabled={mode !== 'view' || state.busy || state.state?.busy} onClick={() => setMode('edit')}>Edit draft plan</button>
            <button type="button" className="primary" disabled={mode !== 'view' || state.busy || state.state?.busy} onClick={() => setMode('preview')}>Preview selected plan</button>
          </div>}
        {draft.plan.milestones.map(milestone => <section key={milestone.key} className="plan-milestone">
          <h3>{milestone.title}</h3><p>{milestone.description}</p>
          <ul>{milestone.tickets.map(ticket => <li key={ticket.key}>
            <details><summary>{ticket.title}</summary>
              {draft.selectedTicketKeys && !draft.selectedTicketKeys.includes(ticket.key) && <p>Excluded from approval</p>}
              <p className="plan-mode">Suggested: {ticket.executionMode === 'manual' ? 'Manual work' : 'Coding work (unpublished)'}</p>
              <h4>Description</h4><p>{ticket.description}</p>
              <h4>Acceptance criteria</h4><p>{ticket.acceptanceCriteria}</p>
              {ticket.prerequisiteKeys.length > 0 && <p>Needs: {ticket.prerequisiteKeys.map(key => titles.get(key)).join(', ')}</p>}
            </details>
          </li>)}</ul>
        </section>)}
      </section>}
    </ProjectDialog>}
  </>;
}
