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
    <button id={buttonId} className="secondary-button" disabled={disabled} onClick={() => { setOpen(true); onOpenChange(true); }}>Publish approved work</button>
    {open && <ProjectDialog title="Publish approved work" locked={state.busy} onClose={close} returnFocusId={buttonId}>
      <p>Only coding tasks from approved local plans are included. Manual task text, project notes, goals and credentials stay private. Publication never starts Codex.</p>
      <p>GitHub assigns Issue numbers after creation. The final title adds [ID] and prerequisite links use those assigned numbers. The recovery marker below is also public.</p>
      <p>Closing this dialog does not undo a publication already approved. Reopen it to inspect results.</p>
      <p role="status" className="feedback">{state.state?.message}</p>
      {state.error && <p role="alert" className="error">{state.error}</p>}
      <button type="button" className="secondary-button" disabled={state.busy || state.state?.busy} onClick={() => { setConfirmed(false); void state.preview(); }}>Preview publication</button>
      {batch && <section aria-label="Publication preview">
        <h3>{batch.repository.fullName}</h3><p>{batch.repository.private ? 'Private repository' : 'Public repository - anyone can read these Issues'}</p>
        <p>{batch.approvedAt ? 'This batch is approved. Retry only resumes its existing content and identities.' : 'Review the public content before approval.'}</p>
        {batch.items.every(item => item.stage === 'pending' && item.issueNumber === null) && <button type="button" className="secondary-button"
          disabled={state.busy || state.state?.busy} onClick={() => { setConfirmed(false); void state.abandon(); }}>Cancel unstarted publication</button>}
        {batch.items.map(item => <section className="plan-milestone" key={item.content.ticketId}>
          <h4>{issueTitle(item.content, item.issueNumber)}</h4>
          <p>Result: {item.stage}</p>{item.message && <p role="note">{item.message}</p>}
          {item.issueNumber && <a href={'https://github.com/' + batch.repository.fullName + '/issues/' + item.issueNumber} target="_blank" rel="noreferrer">Open Issue #{item.issueNumber}</a>}
          <details><summary>Public Issue content</summary><pre className="publication-content">{issueBody(item.content, numbers)}</pre></details>
        </section>)}
        {batch.items.some(item => item.stage !== 'published') && <>
          <label className="plan-consent"><input type="checkbox" checked={confirmed} disabled={state.busy || state.state?.busy}
            onChange={event => setConfirmed(event.target.checked)} />I approve publishing this entire coding batch to the repository shown.</label>
          <button type="button" className="primary" disabled={!confirmed || state.busy || state.state?.busy} onClick={() => {
            setConfirmed(false); void state.publish(confirmed);
          }}>{batch.approvedAt ? 'Resume approved publication' : 'Approve and publish batch'}</button>
        </>}
      </section>}
    </ProjectDialog>}
  </>;
}
