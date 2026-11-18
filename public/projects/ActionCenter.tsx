import { t } from '../workspace/locale.ts';
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
      {manualStart ? <button className="primary" disabled={state.busy} onClick={() => void state.start(ticket.id)}>{t("Start ticket")}</button>
        : <button className={next ? 'primary' : 'secondary-button'} disabled={state.busy} onClick={open}>
            {blocked ? t('Inspect blocker') : ticket.status === 'review' ? t('Review ticket')
              : next ? t('Open coding task') : t('Open ticket')}
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
      <header className="page-header"><h1>{t("Action center")}</h1></header>
      {state.error && <div role="alert" className="error">{state.error}
        <button disabled={state.busy} onClick={() => void state.refresh()}>{t("Retry")}</button></div>}
      <p role="status" className="feedback">{state.message || (!state.views && !state.error ? t('Loading project actions.') : '')}</p>
      {state.views && <div className="action-board" role="region" aria-label={t("Project actions")} aria-busy={state.busy}>
        {actions.review.length > 0 && <section className="action-column" aria-label={t("Review")}>
          <header className="action-column-heading"><h2>{t("Review")}</h2><span className="count">{actions.review.length}</span></header>
          <ul className="action-list">{actions.review.map(item => row(item))}</ul>
        </section>}
        {actions.active.length > 0 && <section className="action-column" aria-label={t("In progress")}>
          <header className="action-column-heading"><h2>{t("In progress")}</h2><span className="count">{actions.active.length}</span></header>
          <ul className="action-list">{actions.active.map(item => row(item))}</ul>
        </section>}
        <section className="action-column" aria-label={t("Next task")}>
          <header className="action-column-heading"><h2>{t("Next task")}</h2></header>
          {actions.next ? <ul className="action-list">{row(actions.next, true)}</ul>
            : <p className="action-empty">{projects.length
              ? t('No eligible Backlog task. Open a project to add work or check blockers.')
              : t('Create a project to plan your first ticket.')}</p>}
        </section>
      </div>}
    </main>
  </WorkspaceShell>;
}
