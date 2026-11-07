import { useState } from 'react';
import { ProjectDialog } from './ProjectDialog.tsx';
import { usePlanController } from '../usePlanController.ts';

export function PlanDraftPanel({ projectId, disabled, onOpenChange }: {
  projectId: string; disabled: boolean; onOpenChange(open: boolean): void;
}) {
  const [open, setOpen] = useState(false);
  const state = usePlanController(projectId, open);
  const draft = state.state?.draft;
  const titles = new Map(draft?.plan.milestones.flatMap(milestone => milestone.tickets.map(ticket => [ticket.key, ticket.title] as const)));
  function close() {
    if (state.state?.busy) void state.cancel();
    setOpen(false); onOpenChange(false);
  }
  const buttonId = 'plan-draft-' + projectId;
  return <>
    <button id={buttonId} className="secondary-button" disabled={disabled} onClick={() => { setOpen(true); onOpenChange(true); }}>AI plan draft</button>
    {open && <ProjectDialog title="AI plan draft" locked={state.busy} returnFocusId={buttonId} onClose={close}>
      <p className="plan-notice">Draft only. Suggestions do not create project tickets, GitHub Issues or coding runs. Approval is a later step.</p>
      <p>FocusFlow sends the goal below to OpenAI through Codex. It does not attach your project files, Personal tasks or GitHub credentials.</p>
      <form className="project-form" onSubmit={event => { event.preventDefault(); void state.generate(); }}>
        <label htmlFor="plan-goal">Project goal</label>
        <textarea id="plan-goal" rows={4} maxLength={3000} value={state.goal}
          disabled={state.busy || state.state?.busy} onChange={event => state.setGoal(event.target.value)} />
        <label className="plan-consent"><input type="checkbox" checked={state.confirmed} disabled={state.busy || state.state?.busy}
          onChange={event => state.setConfirmed(event.target.checked)} />I understand that generating this draft uses Codex allowance.</label>
        <p>The previous saved draft stays available until a valid replacement is saved. Reopening a draft does not call a model.</p>
        <div className="plan-actions">
          <button className="primary" disabled={state.busy || !state.state || state.state.busy || !state.confirmed || !state.goal.trim()}>Generate draft</button>
          {state.state?.busy && <button type="button" className="secondary-button" disabled={state.busy || state.state.cancelling}
            onClick={() => void state.cancel()}>Cancel generation</button>}
        </div>
      </form>
      <p className="feedback" role="status" aria-live="polite">{state.state?.message || (state.busy ? 'Opening the saved draft.' : '')}</p>
      {state.error && <p className="error" role="alert">{state.error}</p>}
      {draft && <section className="plan-draft" aria-label="Saved AI draft">
        <h3>Saved draft</h3>
        <p>Goal: {draft.goal}</p>
        {draft.plan.milestones.map(milestone => <section key={milestone.key} className="plan-milestone">
          <h3>{milestone.title}</h3><p>{milestone.description}</p>
          <ul>{milestone.tickets.map(ticket => <li key={ticket.key}>
            <details><summary>{ticket.title}</summary>
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
