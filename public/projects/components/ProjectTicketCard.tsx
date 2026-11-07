import { useState } from 'react';
import type { ReactNode } from 'react';
import { TICKET_STATUSES, TICKET_STATUS_LABELS, ticketLabel } from '../../../src/shared/projects.ts';
import type { GitHubRepository } from '../../../src/shared/github.ts';
import { CodingNotice } from './CodingNotice.tsx';
import type { ProjectTicket, ProjectView, TicketStatus } from '../../../src/shared/projects.ts';
import { unfinishedPrerequisites } from '../../../src/shared/dependencies.ts';
import { Prerequisites } from './Prerequisites.tsx';
import { ProjectDialog } from './ProjectDialog.tsx';
import { TicketBlockerNotice, TicketBlockerEditor } from './TicketBlockers.tsx';

export function ProjectTicketCard({ ticket, repository, context, view, editingPrerequisites, onEditingChange, onPrerequisites, onBlocker, onVisit, open, busy, error, message, onStatus, onEdit, onOpen, onClose, editor }: {
  repository?: GitHubRepository | null | undefined;
  context?: string | undefined;
  view: ProjectView; editingPrerequisites: boolean; onEditingChange(editing: boolean): void;
  onPrerequisites(id: string, ids: string[]): Promise<boolean>; onVisit(ticket: ProjectTicket): void;
  onBlocker(id: string, reason: string): Promise<boolean>;
  ticket: ProjectTicket; open: boolean; busy: boolean; error: string; message: string;
  onStatus(id: string, status: TicketStatus): Promise<boolean>;
  onEdit(): void; onOpen(): void; onClose(): void; editor?: ReactNode;
}) {
  const blockers = unfinishedPrerequisites(ticket.id, view.tickets, view.dependencies);
  const [blockEditing, setBlockEditing] = useState(false);
  return <li className="manual-ticket">
    <button type="button" id={'ticket-' + ticket.id} className="ticket-card" disabled={busy} aria-haspopup="dialog"
      aria-label={'Open ticket ' + ticket.title} onClick={onOpen}>
      <span className="ticket-card-heading">
        <span className="ticket-title">{ticketLabel(ticket)}</span>
        <span className="status-pill" data-status={ticket.status}>{TICKET_STATUS_LABELS[ticket.status]}</span>
      </span>
      {context && <span className="ticket-milestone">{context}</span>}
      {ticket.description && <span className="ticket-excerpt">{ticket.description}</span>}
      {ticket.executionMode === 'codex' && <span className="ticket-card-hint">{ticket.coding?.issueNumber ? 'Coding / Published' : 'Coding / Unpublished'}</span>}
      <span className="ticket-card-hint">Open details <span aria-hidden="true">&rarr;</span></span>
    </button>
    <TicketBlockerNotice ticket={ticket} view={view} busy={busy} onVisit={onVisit} />
    {open && <ProjectDialog title={ticket.title} returnFocusId={'ticket-' + ticket.id} locked={busy || !!editor || editingPrerequisites} onClose={onClose}>
      <p className="feedback" role="status" aria-live="polite">{message}</p>
      {editor || <>
        <div className="ticket-detail-heading">
          <span className="status-pill" data-status={ticket.status}>{TICKET_STATUS_LABELS[ticket.status]}</span>
          <button className="secondary-button" disabled={busy || editingPrerequisites} onClick={onEdit}
            aria-label={'Edit ticket ' + ticket.title}>Edit ticket</button>
        </div>
        <CodingNotice ticket={ticket} repository={repository} />
        {ticket.executionMode === 'manual' && <><h3>Change status</h3>
        <div className="ticket-status-buttons" role="group" aria-label={'Change status for ' + ticket.title}>
          {TICKET_STATUSES.map(status => <button type="button" key={status} data-status={status}
            aria-pressed={ticket.status === status} disabled={busy || editingPrerequisites || ticket.status === status || (status === 'in_progress' && (blockers.length > 0 || !!ticket.blockReason))}
            onClick={() => void onStatus(ticket.id, status)}>{TICKET_STATUS_LABELS[status]}</button>)}
        </div></>}
        {error && <p className="error" role="alert">{error}</p>}
        <TicketBlockerEditor ticket={ticket} busy={busy} locked={editingPrerequisites && !blockEditing} editing={blockEditing}
          onEditingChange={editing => { setBlockEditing(editing); onEditingChange(editing); }} onSave={onBlocker} />
        <Prerequisites ticket={ticket} view={view} busy={busy || blockEditing}
          onEditingChange={onEditingChange} onSave={onPrerequisites} onVisit={onVisit} />
        <h3>Description</h3>
        <p className="project-description">{ticket.description || 'No description yet.'}</p>
        <h3>Acceptance criteria</h3>
        <p className="project-description">{ticket.acceptanceCriteria || 'No acceptance criteria yet.'}</p>
      </>}
    </ProjectDialog>}
  </li>;
}
