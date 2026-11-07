import { useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { TICKET_STATUSES, TICKET_STATUS_LABELS } from '../../../src/shared/projects.ts';
import type { ProjectTicket, ProjectView } from '../../../src/shared/projects.ts';

export function ProjectBoard({ view, renderTicket }: {
  view: ProjectView; renderTicket(ticket: ProjectTicket): ReactNode;
}) {
  const board = useRef<HTMLDivElement>(null);
  const [scroll, setScroll] = useState({ overflow: false, left: false, right: false });
  function measure() {
    const element = board.current;
    if (!element) return;
    const end = element.scrollWidth - element.clientWidth;
    setScroll({ overflow: end > 2, left: element.scrollLeft > 2, right: element.scrollLeft < end - 2 });
  }
  useLayoutEffect(() => {
    measure();
    const observer = new ResizeObserver(measure);
    if (board.current) observer.observe(board.current);
    return () => observer.disconnect();
  }, []);
  function move(direction: number) {
    const element = board.current;
    if (element) element.scrollBy({ left: direction * element.clientWidth * 0.8, behavior: 'instant' });
  }
  return <>
    <p className="board-hint" id="project-board-hint">All milestones. {scroll.overflow && 'Use the column controls to see every status. '}Open a ticket to change its status.</p>
    {scroll.overflow && <div className="board-navigation" role="group" aria-label="Board columns">
      <button type="button" disabled={!scroll.left} onClick={() => move(-1)}>Previous columns</button>
      <button type="button" disabled={!scroll.right} onClick={() => move(1)}>Next columns</button>
    </div>}
    <div ref={board} className="project-status-board" role="region" aria-label="Project status board"
      aria-describedby="project-board-hint" tabIndex={0} onScroll={measure}>
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
