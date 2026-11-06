import { isTicketStatus, TICKET_STATUSES, TICKET_STATUS_LABELS } from '../../../src/shared/projects.ts';
import type { ProjectTicket, ProjectView, TicketStatus } from '../../../src/shared/projects.ts';
import { Prerequisites } from './Prerequisites.tsx';

export function ManualTicket({ ticket, view, busy, editingLocked, onEditingChange, onStatus, onPrerequisites, onVisit }: {
  ticket: ProjectTicket;
  view: ProjectView;
  busy: boolean;
  editingLocked: boolean;
  onEditingChange(editing: boolean): void;
  onStatus(id: string, status: TicketStatus): Promise<boolean>;
  onPrerequisites(id: string, ids: string[]): Promise<boolean>;
  onVisit(ticket: ProjectTicket): void;
}) {
  return (
    <li className="manual-ticket" id={'ticket-' + ticket.id} tabIndex={-1}>
      <h3 className="ticket-title">{ticket.title}</h3>
      <div className="ticket-status">
        <label htmlFor={'status-' + ticket.id}>
          Status<span className="sr-only"> for {ticket.title}</span>
        </label>
        <select id={'status-' + ticket.id} value={ticket.status} disabled={busy || editingLocked}
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
      <Prerequisites ticket={ticket} view={view} busy={busy} editingLocked={editingLocked}
        onEditingChange={onEditingChange} onSave={onPrerequisites} onVisit={onVisit} />
    </li>
  );
}
