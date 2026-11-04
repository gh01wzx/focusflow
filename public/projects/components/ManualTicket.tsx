import { isTicketStatus, TICKET_STATUSES, TICKET_STATUS_LABELS } from '../../../src/shared/projects.ts';
import type { ProjectTicket, TicketStatus } from '../../../src/shared/projects.ts';

export function ManualTicket({ ticket, busy, onStatus }: {
  ticket: ProjectTicket;
  busy: boolean;
  onStatus(id: string, status: TicketStatus): Promise<boolean>;
}) {
  return (
    <li className="manual-ticket">
      <div className="ticket-heading">
        <h3>{ticket.title}</h3>
        <span className="local-pill">Manual</span>
        <label className="sr-only" htmlFor={'status-' + ticket.id}>Status for {ticket.title}</label>
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
    </li>
  );
}
