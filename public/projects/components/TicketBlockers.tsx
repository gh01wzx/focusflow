import { useState } from 'react';
import { isTicketBlocked, unfinishedPrerequisites } from '../../../src/shared/dependencies.ts';
import type { ProjectTicket, ProjectView } from '../../../src/shared/projects.ts';

export function TicketBlockerNotice({ ticket, view, busy, onVisit }: {
  ticket: ProjectTicket; view: ProjectView; busy: boolean; onVisit(ticket: ProjectTicket): void;
}) {
  if (!isTicketBlocked(ticket, view.tickets, view.dependencies)) return null;
  const blockers = unfinishedPrerequisites(ticket.id, view.tickets, view.dependencies);
  return <div className="ticket-blockers" role="group" aria-label={'Blockers for ' + ticket.title}>
    <strong className="blocker-badge">Blocked</strong>
    {ticket.blockReason && <p className="blocker-reason">{ticket.blockReason}</p>}
    {blockers.length > 0 && <><p>Waiting for:</p><ul>{blockers.map(item => <li key={item.id}>
      <button type="button" className="blocker-link" disabled={busy} onClick={() => onVisit(item)}
        aria-label={'Open prerequisite ' + item.title}>{item.title}</button>
      <small>{view.milestones.find(milestone => milestone.id === item.milestoneId)?.title}</small>
    </li>)}</ul></>}
  </div>;
}

export function TicketBlockerEditor({ ticket, busy, locked, editing, onEditingChange, onSave }: {
  ticket: ProjectTicket; busy: boolean; locked: boolean; editing: boolean;
  onEditingChange(editing: boolean): void; onSave(id: string, reason: string): Promise<boolean>;
}) {
  const [reason, setReason] = useState(ticket.blockReason);
  return <section className="ticket-blocker-editor" aria-label="Other blocker">
    <h3>Other blocker</h3>
    {editing ? <form aria-label={'Blocker for ' + ticket.title} onSubmit={event => {
      event.preventDefault();
      void onSave(ticket.id, reason).then(saved => { if (saved) onEditingChange(false); });
    }}>
      <label htmlFor={'block-reason-' + ticket.id}>What is stopping this ticket?</label>
      <textarea id={'block-reason-' + ticket.id} value={reason} maxLength={1000} rows={3} disabled={busy}
        onChange={event => setReason(event.target.value)} />
      <div className="prerequisite-buttons">
        <button className="primary" disabled={busy || !reason.trim() || reason.trim() === ticket.blockReason}>Save blocker</button>
        <button type="button" className="secondary-button" disabled={busy} onClick={() => onEditingChange(false)}>Cancel</button>
      </div>
    </form> : <>
      <p>{ticket.blockReason || 'Use a reason for waiting on something outside this project. For another ticket, set a prerequisite below.'}</p>
      <div className="prerequisite-buttons">
        <button className="secondary-button" disabled={busy || locked} onClick={() => { setReason(ticket.blockReason); onEditingChange(true); }}>
          {ticket.blockReason ? 'Edit blocker' : 'Add blocker'}</button>
        {ticket.blockReason && <button className="secondary-button" disabled={busy || locked} onClick={() => void onSave(ticket.id, '')}>Clear blocker</button>}
      </div>
    </>}
    <p className="blocker-help">A blocker does not change status. Clearing it or finishing a prerequisite never starts work automatically.</p>
  </section>;
}
