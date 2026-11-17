import { WorkspaceShell } from '../workspace/WorkspaceShell.tsx';
import type { WorkspaceProps } from '../workspace/WorkspaceShell.tsx';
import { projectActions } from '../../src/shared/actions.ts';
import type { ActionTicket } from '../../src/shared/actions.ts';
import { isTicketBlocked } from '../../src/shared/dependencies.ts';
import { useActionsController } from './useActionsController.ts';
import { ProjectNavigation } from './components/ProjectNavigation.tsx';
import { TicketBlockerNotice } from './components/TicketBlockers.tsx';

export function ActionCenter({ onWorkspaceChange, onProject, onTicket, onNewProject }: WorkspaceProps & {
  onProject(projectId: string): void;
  onTicket(projectId: string, ticketId: string): void;
  onNewProject(): void;
}) {
  const state = useActionsController();
  const actions = projectActions(state.views ?? []);
  const projects = state.views?.flatMap(view => view.projects) ?? [];

  function row(item: ActionTicket, next = false) {
    const { ticket } = item;
    const view = state.views!.find(view => view.selectedProjectId === ticket.projectId)!;
    const open = () => onTicket(ticket.projectId, ticket.id);
    const blocked = isTicketBlocked(ticket, view.tickets, view.dependencies);
    const manualStart = next && ticket.executionMode === 'manual' && !blocked;
    return <li className="action-card" key={ticket.id}>
      <div className="action-card-content">
        <h3><button className="text-button" disabled={state.busy} onClick={open}>{ticket.title}</button></h3>
        <p>{item.project} / {item.milestone}</p>
      </div>
      {manualStart ? <button className="primary" disabled={state.busy} onClick={() => void state.start(ticket.id)}>Start ticket</button>
        : <button className={next ? 'primary' : 'secondary-button'} disabled={state.busy} onClick={open}>
            {blocked ? 'Inspect blocker' : ticket.status === 'review' ? 'Review ticket'
              : next ? 'Open coding task' : 'Open ticket'}
          </button>}
      {blocked && <div className="action-blockers">
        <TicketBlockerNotice ticket={ticket} view={view} busy={state.busy}
          onVisit={other => onTicket(other.projectId, other.id)} />
      </div>}
    </li>;
  }

  return <WorkspaceShell workspace="projects" busy={state.busy} onWorkspaceChange={onWorkspaceChange}
    navigation={<ProjectNavigation projects={projects} overview busy={state.busy}
      onOverview={() => {}} onProject={onProject} onNewProject={onNewProject} />}>
    <main className="actions-main">
      <header className="page-header"><h1>Action center</h1></header>
      {state.error && <div role="alert" className="error">{state.error}
        <button disabled={state.busy} onClick={() => void state.refresh()}>Retry</button></div>}
      <p role="status" className="feedback">{state.message || (!state.views && !state.error ? 'Loading project actions.' : '')}</p>
      {state.views && <div className="action-board" role="region" aria-label="Project actions" aria-busy={state.busy}>
        {actions.review.length > 0 && <section className="action-column" aria-label="Review">
          <header className="action-column-heading"><h2>Review</h2><span className="count">{actions.review.length}</span></header>
          <ul className="action-list">{actions.review.map(item => row(item))}</ul>
        </section>}
        {actions.active.length > 0 && <section className="action-column" aria-label="In progress">
          <header className="action-column-heading"><h2>In progress</h2><span className="count">{actions.active.length}</span></header>
          <ul className="action-list">{actions.active.map(item => row(item))}</ul>
        </section>}
        <section className="action-column" aria-label="Next task">
          <header className="action-column-heading"><h2>Next task</h2></header>
          {actions.next ? <ul className="action-list">{row(actions.next, true)}</ul>
            : <p className="action-empty">{projects.length
              ? 'No eligible Backlog task. Open a project to add work or check blockers.'
              : 'Create a project to plan your first ticket.'}</p>}
        </section>
      </div>}
    </main>
  </WorkspaceShell>;
}
