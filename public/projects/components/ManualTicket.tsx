import { isTicketStatus, TICKET_STATUSES, TICKET_STATUS_LABELS } from '../../../src/shared/projects.ts';
import type { ProjectTicket, TicketStatus } from '../../../src/shared/projects.ts';
import type { ReactNode } from 'react';

export function ManualTicket({ ticket, busy, onStatus, onEdit, editor }: {
  ticket: ProjectTicket;
  busy: boolean;
  onStatus(id: string, status: TicketStatus): Promise<boolean>;
  onEdit(): void;
  editor?: ReactNode;
}) {
  return (
    <li className="manual-ticket">
      {editor || <>
      <div className="detail-heading">
        <h3 className="ticket-title">{ticket.title}</h3>
        <button className="text-button" disabled={busy} onClick={onEdit} aria-label={'Edit ticket ' + ticket.title}>Edit</button>
      </div>
      <div className="ticket-status">
        <label htmlFor={'status-' + ticket.id}>
          Status<span className="sr-only"> for {ticket.title}</span>
        </label>
        <select id={'status-' + ticket.id} value={ticket.status} disabled={busy}
          onChange={event => {
            if (isTicketStatus(event.target.value)) void onStatus(ticket.id, event.target.value);
          }}>
          {TICKET_STATUSES.map(status => <option key={status} value={status}>{TICKET_STATUS_LABELS[status]}</option>)}
        </select>
      </div>
      {ticket.description && <p className="project-description">{ticket.description}</p>}
      {ticket.acceptanceCriteria && (
        <details className="ticket-acceptance">
          <summary>Acceptance criteria</summary>
          <p className="project-description">{ticket.acceptanceCriteria}</p>
        </details>
      )}
      </>}
    </li>
  );
}
