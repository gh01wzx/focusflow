import { useState } from 'react';
import { ProjectDialog } from './ProjectDialog.tsx';
import { usePlanController } from '../usePlanController.ts';
import { PlanDraftEditor, PlanApprovalPreview } from './PlanDraftEditor.tsx';
import { createAiClient } from '../../../src/client/ai.ts';
import { defaultPlanningSelection, DSH_MODELS } from '../../../src/shared/planning-ai.ts';
import type { PlanningModel, PlanningSelection } from '../../../src/shared/planning-ai.ts';

const ai = createAiClient();

export function PlanDraftPanel({ projectId, disabled, onOpenChange, onApproved }: {
  projectId: string; disabled: boolean; onOpenChange(open: boolean): void; onApproved(): void;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'view' | 'edit' | 'preview'>('view');
  const [selection, setSelection] = useState<PlanningSelection>(defaultPlanningSelection);
  const [codexModels, setCodexModels] = useState<PlanningModel[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [modelError, setModelError] = useState('');
  const state = usePlanController(projectId, open);
  const models = selection.provider === 'dsh' ? DSH_MODELS : codexModels;
  const model = models.find(option => option.id === selection.model);
  const choosing = loadingModels || state.busy || !!state.state?.busy || mode !== 'view';
  const canGenerate = !choosing && !!state.state && state.confirmed && !!state.goal.trim()
    && (selection.provider === 'codex' && !selection.model || !!model);
  function choose(next: PlanningSelection) {
    setSelection(next);
    state.setConfirmed(false);
  }
  async function loadModels() {
    setLoadingModels(true);
    setModelError('');
    try {
      const options = await ai.codexModels();
      setCodexModels(options);
      if (!options.length) setModelError('Codex returned no selectable models. You can still use its default.');
      if (selection.model && !options.some(option => option.id === selection.model
          && (!selection.effort || option.efforts.includes(selection.effort)))) choose(defaultPlanningSelection);
    } catch (error) {
      setModelError(error instanceof Error ? error.message : 'Could not load Codex models.');
    } finally { setLoadingModels(false); }
  }
  const draft = state.state?.draft;
  const titles = new Map(draft?.plan.milestones.flatMap(milestone => milestone.tickets.map(ticket => [ticket.key, ticket.title] as const)));
  function close() {
    if (state.state?.busy) void state.cancel();
    setOpen(false); onOpenChange(false);
  }
  const buttonId = 'plan-draft-' + projectId;
  return <>
    <button id={buttonId} className="secondary-button" disabled={disabled} onClick={() => { setOpen(true); onOpenChange(true); }}>AI plan draft</button>
    {open && <ProjectDialog title="AI plan draft" locked={state.busy || mode !== 'view'} returnFocusId={buttonId} onClose={close}>
      <p className="plan-notice">Suggestions stay private until you preview and approve the selected plan. Approval never starts work or publishes GitHub Issues.</p>
      <p>FocusFlow sends the goal as text to {selection.provider === 'codex' ? 'OpenAI through Codex' : 'DeepSeek through DeepSeek Harness'}.</p>
      <form className="project-form" onSubmit={event => { event.preventDefault(); if (canGenerate) void state.generate(selection); }}>
        <label htmlFor="plan-provider">Provider</label>
        <select id="plan-provider" value={selection.provider} disabled={choosing} onChange={event => {
          setModelError('');
          choose(event.target.value === 'dsh' ? { provider: 'dsh', model: DSH_MODELS[0]!.id, effort: '' } : defaultPlanningSelection);
        }}>
          <option value="codex">Codex</option>
          <option value="dsh">DeepSeek Harness</option>
        </select>
        <label htmlFor="plan-model">Model</label>
        <div className="plan-actions">
          <select id="plan-model" value={selection.model} disabled={choosing} onChange={event => {
            choose({ ...selection, model: event.target.value, effort: '' });
          }}>
            {selection.provider === 'codex' && <option value="">Codex default</option>}
            {models.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
          </select>
          {selection.provider === 'codex' && <button type="button" className="secondary-button" disabled={choosing}
            onClick={() => void loadModels()}>{loadingModels ? 'Loading models' : 'Load Codex models'}</button>}
        </div>
        {modelError && <p role="alert" className="error">{modelError}</p>}
        <label htmlFor="plan-effort">Reasoning effort</label>
        <select id="plan-effort" value={selection.effort} disabled={choosing || !model?.efforts.length}
          onChange={event => choose({ ...selection, effort: event.target.value })}>
          <option value="">{model?.defaultEffort ? `Default (${model.defaultEffort})` : 'Provider default'}</option>
          {model?.efforts.map(effort => <option key={effort} value={effort}>{effort}</option>)}
        </select>
        <label htmlFor="plan-goal">Project goal</label>
        <textarea id="plan-goal" rows={4} maxLength={3000} value={state.goal}
          disabled={state.busy || state.state?.busy || mode !== 'view'} onChange={event => state.setGoal(event.target.value)} />
        <label className="plan-consent"><input type="checkbox" checked={state.confirmed} disabled={choosing}
          onChange={event => state.setConfirmed(event.target.checked)} />I understand that generating this draft uses {
            selection.provider === 'codex' ? 'Codex allowance' : 'my DeepSeek API balance'}.</label>
        <p>The previous saved draft stays available until a valid replacement is saved. Reopening a draft does not call a model.</p>
        <div className="plan-actions">
          <button className="primary" disabled={!canGenerate}>Generate draft</button>
          {state.state?.busy && <button type="button" className="secondary-button" disabled={state.busy || state.state.cancelling}
            onClick={() => void state.cancel()}>Cancel generation</button>}
        </div>
      </form>
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
