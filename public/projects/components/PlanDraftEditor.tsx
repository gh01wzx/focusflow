import { t } from '../../workspace/locale.ts';
import { useState } from 'react';
import type { PlanDraft, SuggestedTicket } from '../../../src/shared/plans.ts';
import { selectedPlan } from '../../../src/shared/plans.ts';

export function PlanDraftEditor({ draft, busy, onSave, onCancel }: {
  draft: PlanDraft; busy: boolean; onSave(draft: PlanDraft): Promise<boolean>; onCancel(): void;
}) {
  const [plan, setPlan] = useState(() => structuredClone(draft.plan));
  const [selected, setSelected] = useState(() => draft.selectedTicketKeys ?? draft.plan.milestones.flatMap(milestone => milestone.tickets.map(ticket => ticket.key)));
  const tickets = plan.milestones.flatMap(milestone => milestone.tickets);
  function ticketChange(key: string, change: Partial<SuggestedTicket>) {
    setPlan(current => ({ milestones: current.milestones.map(milestone => ({ ...milestone,
      tickets: milestone.tickets.map(ticket => ticket.key === key ? { ...ticket, ...change } : ticket) })) }));
  }
  return <form className="project-form plan-editor" aria-label={t("Edit draft plan")} onSubmit={event => {
    event.preventDefault();
    void onSave({ ...draft, plan, selectedTicketKeys: selected }).then(saved => { if (saved) onCancel(); });
  }}>
    <p>{t("Exclude unwanted suggestions with Include task. Only included tasks and their milestones will be created. Save changes before previewing.")}</p>
    {plan.milestones.map(milestone => <fieldset key={milestone.key} disabled={busy} className="plan-milestone">
      <legend>{milestone.title || t('Milestone')}</legend>
      <label>{t("Milestone title")}<input maxLength={200} required value={milestone.title} onChange={event => setPlan(current => ({
        milestones: current.milestones.map(item => item.key === milestone.key ? { ...item, title: event.target.value } : item),
      }))} /></label>
      <label>{t("Milestone description")}<textarea maxLength={2000} value={milestone.description} onChange={event => setPlan(current => ({
        milestones: current.milestones.map(item => item.key === milestone.key ? { ...item, description: event.target.value } : item),
      }))} /></label>
      {milestone.tickets.map(ticket => <fieldset className="plan-ticket-editor" key={ticket.key}>
        <legend>{ticket.title || t('Task')}</legend>
        <label className="plan-consent"><input type="checkbox" checked={selected.includes(ticket.key)}
          onChange={event => setSelected(current => event.target.checked ? [...current, ticket.key] : current.filter(key => key !== ticket.key))} />{t("Include task:")} {ticket.title}</label>
        <label>{t("Task title")}<input maxLength={200} required value={ticket.title} onChange={event => ticketChange(ticket.key, { title: event.target.value })} /></label>
        <label>{t("Task description")}<textarea maxLength={2000} value={ticket.description} onChange={event => ticketChange(ticket.key, { description: event.target.value })} /></label>
        <label>{t("Acceptance criteria")}<textarea maxLength={2000} required value={ticket.acceptanceCriteria} onChange={event => ticketChange(ticket.key, { acceptanceCriteria: event.target.value })} /></label>
        <label>{t("Work type")}<select value={ticket.executionMode} onChange={event => ticketChange(ticket.key, { executionMode: event.target.value as 'manual' | 'codex' })}>
          <option value="manual">{t("Manual")}</option><option value="codex">{t("Coding with Codex")}</option>
        </select></label>
        <div role="group" aria-label={t('Prerequisites for ') + ticket.title}>
          <p>{t("Prerequisites")}</p>
          {tickets.filter(item => item.key !== ticket.key).map(item => <label key={item.key} className="plan-consent">
            <input type="checkbox" checked={ticket.prerequisiteKeys.includes(item.key)} onChange={event => ticketChange(ticket.key, {
              prerequisiteKeys: event.target.checked ? [...ticket.prerequisiteKeys, item.key] : ticket.prerequisiteKeys.filter(key => key !== item.key),
            })} />{item.title}
          </label>)}
        </div>
      </fieldset>)}
    </fieldset>)}
    <div className="plan-actions"><button className="primary" disabled={busy}>{t("Save draft changes")}</button>
      <button type="button" className="secondary-button" disabled={busy} onClick={onCancel}>{t("Cancel draft changes")}</button></div>
  </form>;
}

export function PlanApprovalPreview({ draft, busy, onApprove, onCancel }: {
  draft: PlanDraft; busy: boolean; onApprove(confirmed: boolean): Promise<boolean>; onCancel(): void;
}) {
  const [confirmed, setConfirmed] = useState(false);
  let plan; let error = '';
  try { plan = selectedPlan(draft); } catch (failure) { error = failure instanceof Error ? failure.message : 'Check the selected plan.'; }
  const tickets = plan?.milestones.flatMap(milestone => milestone.tickets) ?? [];
  const coding = tickets.filter(ticket => ticket.executionMode === 'codex');
  return <section className="plan-preview" aria-label={t("Plan approval preview")}>
    <h3>{t("Preview selected plan")}</h3>
    {error ? <p className="error" role="alert">{t(error)}</p> : <>
      <p>{plan!.milestones.length} {t("milestones,")} {tickets.length} {t("tasks. All start in Backlog. Nothing runs automatically.")}</p>
      {plan!.milestones.map(milestone => <section className="plan-milestone" key={milestone.key}>
        <h4>{milestone.title}</h4><p>{milestone.description}</p>
        <ul>{milestone.tickets.map(ticket => <li key={ticket.key}>
          <strong>{ticket.title}</strong><p>{ticket.description}</p><p>{t("Acceptance criteria:")} {ticket.acceptanceCriteria}</p>
          <p>{ticket.executionMode === 'manual' ? t('Manual work - stays local') : t('Coding work - intended for later GitHub publication, currently unpublished')}</p>
          {ticket.prerequisiteKeys.length > 0 && <p>{t("Needs:")} {ticket.prerequisiteKeys.map(key => tickets.find(item => item.key === key)!.title).join(', ')}</p>}
        </li>)}</ul>
      </section>)}
      <p>{coding.length} {t("coding tasks remain unpublished and cannot Start. Repository confirmation and publication are separate later steps.")}</p>
      <label className="plan-consent"><input type="checkbox" checked={confirmed} disabled={busy}
        onChange={event => setConfirmed(event.target.checked)} />{t("I approve creating this selected plan. Coding tasks remain unpublished.")}</label>
    </>}
    <div className="plan-actions"><button type="button" className="primary" disabled={busy || !!error || !confirmed} onClick={() => {
      setConfirmed(false); void onApprove(confirmed).then(saved => { if (saved) onCancel(); });
    }}>{t("Approve selected plan")}</button>
      <button type="button" className="secondary-button" disabled={busy} onClick={onCancel}>{t("Back to draft")}</button></div>
  </section>;
}
