import type { ReactNode } from 'react';
import { TICKET_STATUSES, TICKET_STATUS_LABELS } from '../../../src/shared/projects.ts';
import type { ProjectTicket, ProjectView } from '../../../src/shared/projects.ts';

export function ProjectBoard({ view, renderTicket }: {
  view: ProjectView; renderTicket(ticket: ProjectTicket): ReactNode;
}) {
  return <>
    <p className="board-hint" id="project-board-hint">All milestones. Scroll horizontally to see every status. Open a ticket to change its status.</p>
    <div className="project-status-board" role="region" aria-label="Project status board"
      aria-describedby="project-board-hint" tabIndex={0}>
      {TICKET_STATUSES.map(status => {
        const tickets = view.tickets.filter(ticket => ticket.status === status);
        return <section className="status-column" data-status={status} key={status} aria-label={TICKET_STATUS_LABELS[status]}>
          <h3>{TICKET_STATUS_LABELS[status]} <span className="count">{tickets.length}</span></h3>
          {tickets.length ? <ul className="project-ticket-list">{tickets.map(renderTicket)}</ul>
            : <p className="project-empty">No tickets.</p>}
        </section>;
      })}
    </div>
  </>;
}
