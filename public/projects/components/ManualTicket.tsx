import { useState } from 'react';
import type { ReactNode } from 'react';
import { TICKET_STATUSES, TICKET_STATUS_LABELS } from '../../../src/shared/projects.ts';
import type { ProjectTicket, TicketStatus } from '../../../src/shared/projects.ts';
import { ProjectDialog } from './ProjectDialog.tsx';

export function ManualTicket({ ticket, busy, error, message, onStatus, onEdit, onClearError, editor }: {
  ticket: ProjectTicket; busy: boolean; error: string; message: string;
  onStatus(id: string, status: TicketStatus): Promise<boolean>;
  onEdit(): void; onClearError(): void; editor?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return <li className="manual-ticket">
    <button type="button" className="ticket-card" disabled={busy} aria-haspopup="dialog"
      aria-label={'Open ticket ' + ticket.title} onClick={() => { onClearError(); setOpen(true); }}>
      <span className="ticket-card-heading">
        <span className="ticket-title">{ticket.title}</span>
        <span className="status-pill" data-status={ticket.status}>{TICKET_STATUS_LABELS[ticket.status]}</span>
      </span>
      {ticket.description && <span className="ticket-excerpt">{ticket.description}</span>}
      <span className="ticket-card-hint">Open details <span aria-hidden="true">&rarr;</span></span>
    </button>
    {open && <ProjectDialog title={ticket.title} locked={busy || !!editor} onClose={() => { setOpen(false); onClearError(); }}>
      <p className="feedback" role="status" aria-live="polite">{message}</p>
      {editor || <>
        <div className="ticket-detail-heading">
          <span className="status-pill" data-status={ticket.status}>{TICKET_STATUS_LABELS[ticket.status]}</span>
          <button className="secondary-button" disabled={busy} onClick={onEdit}
            aria-label={'Edit ticket ' + ticket.title}>Edit ticket</button>
        </div>
        <h3>Change status</h3>
        <div className="ticket-status-buttons" role="group" aria-label={'Change status for ' + ticket.title}>
          {TICKET_STATUSES.map(status => <button type="button" key={status} data-status={status}
            aria-pressed={ticket.status === status} disabled={busy || ticket.status === status}
            onClick={() => void onStatus(ticket.id, status)}>{TICKET_STATUS_LABELS[status]}</button>)}
        </div>
        {error && <p className="error" role="alert">{error}</p>}
        <h3>Description</h3>
        <p className="project-description">{ticket.description || 'No description yet.'}</p>
        <h3>Acceptance criteria</h3>
        <p className="project-description">{ticket.acceptanceCriteria || 'No acceptance criteria yet.'}</p>
      </>}
    </ProjectDialog>}
  </li>;
}
