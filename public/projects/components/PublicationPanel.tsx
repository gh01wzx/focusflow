import { t } from '../../workspace/locale.ts';
import { useState } from 'react';
import { ProjectDialog } from './ProjectDialog.tsx';
import { usePublicationController } from '../usePublicationController.ts';
import { issueBody, issueTitle } from '../../../src/shared/publication.ts';

export function PublicationPanel({ projectId, disabled, onOpenChange, onChanged }: {
  projectId: string; disabled: boolean; onOpenChange(open: boolean): void; onChanged(): void;
}) {
  const [open, setOpen] = useState(false), [confirmed, setConfirmed] = useState(false);
  const state = usePublicationController(projectId, open, onChanged);
  const batch = state.state?.batch, buttonId = 'publication-' + projectId;
  const numbers = new Map(batch?.items.filter(item => item.issueNumber !== null).map(item => [item.content.ticketId, item.issueNumber!]));
  const close = () => { setOpen(false); setConfirmed(false); onOpenChange(false); };
  return <>
    <button id={buttonId} className="secondary-button" disabled={disabled} onClick={() => { setOpen(true); onOpenChange(true); }}>{t("Publish approved work")}</button>
    {open && <ProjectDialog title={t("Publish approved work")} locked={state.busy} onClose={close} returnFocusId={buttonId}>
      <p>{t("This preview includes saved coding tickets, created by you or approved from a plan. Unapproved AI suggestions, manual task text, project notes, goals and credentials stay private. Publication never starts Codex.")}</p>
      <p>{t("GitHub assigns Issue numbers after creation. The final title adds [ID] and prerequisite links use those assigned numbers. The recovery marker below is also public.")}</p>
      <p>{t("Closing this dialog does not undo a publication already approved. Reopen it to inspect results.")}</p>
      <p role="status" className="feedback">{state.state?.message}</p>
      {state.error && <p role="alert" className="error">{state.error}</p>}
      <button type="button" className="secondary-button" disabled={state.busy || state.state?.busy} onClick={() => { setConfirmed(false); void state.preview(); }}>{t("Preview publication")}</button>
      {batch && <section aria-label={t("Publication preview")}>
        <h3>{batch.repository.fullName}</h3><p>{batch.repository.private ? t('Private repository') : t('Public repository - anyone can read these Issues')}</p>
        <p>{batch.approvedAt ? t('This batch is approved. Retry only resumes its existing content and identities.') : t('Review the public content before approval.')}</p>
        {batch.items.every(item => item.stage === 'pending' && item.issueNumber === null) && <button type="button" className="secondary-button"
          disabled={state.busy || state.state?.busy} onClick={() => { setConfirmed(false); void state.abandon(); }}>{t("Cancel unstarted publication")}</button>}
        {batch.items.map(item => <section className="plan-milestone" key={item.content.ticketId}>
          <h4>{issueTitle(item.content, item.issueNumber)}</h4>
          <p>{t("Result:")} {item.stage}</p>{item.message && <p role="note">{item.message}</p>}
          {item.issueNumber && <a href={'https://github.com/' + batch.repository.fullName + '/issues/' + item.issueNumber} target="_blank" rel="noreferrer">{t("Open Issue #")}{item.issueNumber}</a>}
          <details><summary>{t("Public Issue content")}</summary><pre className="publication-content">{issueBody(item.content, numbers)}</pre></details>
        </section>)}
        {batch.items.some(item => item.stage !== 'published') && <>
          <label className="plan-consent"><input type="checkbox" checked={confirmed} disabled={state.busy || state.state?.busy}
            onChange={event => setConfirmed(event.target.checked)} />{t("I approve publishing this entire coding batch to the repository shown.")}</label>
          <button type="button" className="primary" disabled={!confirmed || state.busy || state.state?.busy} onClick={() => {
            setConfirmed(false); void state.publish(confirmed);
          }}>{batch.approvedAt ? t('Resume approved publication') : t('Approve and publish batch')}</button>
        </>}
      </section>}
    </ProjectDialog>}
  </>;
}
