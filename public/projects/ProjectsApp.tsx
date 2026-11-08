import { useEffect, useState } from 'react';
import { GitHubConnection } from './components/GitHubConnection.tsx';
import { ActionCenter } from './ActionCenter.tsx';
import { WorkspaceShell } from '../workspace/WorkspaceShell.tsx';
import type { WorkspaceProps } from '../workspace/WorkspaceShell.tsx';
import { useProjectsController } from './useProjectsController.ts';
import { EntityComposer } from './components/EntityComposer.tsx';
import { TicketComposer } from './components/TicketComposer.tsx';
import { ProjectTicketCard } from './components/ProjectTicketCard.tsx';
import type { GitHubRepository } from '../../src/shared/github.ts';
import { ProjectBoard } from './components/ProjectBoard.tsx';
import { PlanDraftPanel } from './components/PlanDraftPanel.tsx';
import { PublicationPanel } from './components/PublicationPanel.tsx';
import { ProjectNavigation } from './components/ProjectNavigation.tsx';
import { ProjectDialog } from './components/ProjectDialog.tsx';
import { DetailsEditor } from './components/DetailsEditor.tsx';
import type { EntityDraft, ProjectTicket } from '../../src/shared/projects.ts';
import type { EditKind } from './components/DetailsEditor.tsx';

export function ProjectsApp(props: WorkspaceProps) {
  const [destination, setDestination] = useState<{ projectId?: string; ticketId?: string } | null>(null);
  return destination ? <ProjectHierarchy {...props} initialProjectId={destination.projectId} initialTicketId={destination.ticketId} onBack={() => setDestination(null)} />
    : <ActionCenter {...props} onProject={projectId => setDestination({ projectId })}
        onTicket={(projectId, ticketId) => setDestination({ projectId, ticketId })} onNewProject={() => setDestination({})} />;
}
function ProjectHierarchy({ onWorkspaceChange, onBack, initialProjectId, initialTicketId }: WorkspaceProps & { onBack(): void; initialProjectId: string | undefined; initialTicketId: string | undefined }) {
  const state = useProjectsController(initialProjectId, initialTicketId);
  const [composing, setComposing] = useState<'project' | 'milestone' | 'ticket' | null>(initialProjectId === undefined ? 'project' : null);
  const [openTicketId, setOpenTicketId] = useState<string | null>(null);
  const [openingTicket, setOpeningTicket] = useState<string | null>(initialTicketId ?? null);
  const [editingPrerequisites, setEditingPrerequisites] = useState(false);
  const [layout, setLayout] = useState<'milestones' | 'board'>('milestones');
  const [planning, setPlanning] = useState(false);
  const [repository, setRepository] = useState<{ projectId: string; value: GitHubRepository | null } | null>(null);
  const { view, busy, milestoneId, error, message } = state;
  const locked = busy || planning || editingPrerequisites || !!state.editing || openTicketId !== null || (composing !== null && view !== null);
  const project = view?.projects.find(item => item.id === view.selectedProjectId);
  const milestone = view?.milestones.find(item => item.id === milestoneId);
  const tickets = view?.tickets.filter(item => item.milestoneId === milestoneId) ?? [];
  useEffect(() => {
    if (!view || !openingTicket) return;
    if (view.tickets.some(ticket => ticket.id === openingTicket)) setOpenTicketId(openingTicket);
    setOpeningTicket(null);
  }, [view, openingTicket]);
  function editor(kind: EditKind, id: string, initial: EntityDraft, acceptanceCriteria = '') {
    const ticket = kind === 'ticket' ? view?.tickets.find(item => item.id === id) : undefined;
    return state.editing?.kind === kind && state.editing.id === id
      ? <DetailsEditor key={kind + id} kind={kind} initial={initial} acceptanceCriteria={acceptanceCriteria}
          {...(ticket ? { executionMode: ticket.executionMode, executionLocked: ticket.status !== 'backlog' || !!ticket.coding?.issueNumber } : {})}
          busy={busy} error={error} onSave={state.saveEdit} onCancel={state.cancelEdit} /> : null;
  }
  function closeComposer() { setComposing(null); state.clearError(); }
  function renderTicket(ticket: ProjectTicket) {
    return view && <ProjectTicketCard key={ticket.id} ticket={ticket} view={view}
      repository={repository?.projectId === ticket.projectId ? repository.value : null}
      context={layout === 'board' ? view.milestones.find(item => item.id === ticket.milestoneId)?.title : undefined}
      editingPrerequisites={editingPrerequisites} onEditingChange={setEditingPrerequisites}
      onPrerequisites={state.setPrerequisites} onBlocker={state.setBlocker} onVisit={item => {
        state.clearFeedback(); state.selectMilestone(item.milestoneId); setOpenTicketId(item.id);
      }} open={openTicketId === ticket.id}
      busy={busy || (!!state.editing && state.editing.id !== ticket.id) || !!composing || (openTicketId !== null && openTicketId !== ticket.id)}
      error={error} message={message} onStatus={state.setStatus}
      onOpen={() => { state.clearFeedback(); setOpenTicketId(ticket.id); }}
      onClose={() => { setOpenTicketId(null); state.clearFeedback(); }} onEdit={() => state.beginEdit('ticket', ticket.id)}
      editor={editor('ticket', ticket.id, ticket, ticket.acceptanceCriteria)} onChanged={() => { void state.refresh(); }} />;
  }
  function openComposer(kind: 'project' | 'milestone' | 'ticket') { state.clearError(); setComposing(kind); }
  return (
    <WorkspaceShell workspace="projects" busy={locked} onWorkspaceChange={onWorkspaceChange} navigation={
      <ProjectNavigation projects={view?.projects ?? []} selectedId={project?.id} busy={locked}
        onOverview={onBack} onProject={id => { void state.selectProject(id); }}
        onNewProject={() => openComposer('project')} />
    }>
      <main className="project-main">
        <div className="breadcrumb">Projects {project && <><span>/</span>{project.title}</>}</div>
        <header className="page-header">
          <div>
            <p className="eyebrow">PROJECT WORKSPACE</p>
            <h1>Projects<span className="heading-dot">.</span></h1>
            <p className="subtitle">Open a ticket to work on it.</p>
          </div>
        </header>
        {error && !state.editing && !openTicketId && (!composing || !view) && <div className="error" role="alert">{error}
          <button disabled={busy} onClick={() => void state.refresh()}>Retry</button></div>}
        {!openTicketId && <p className="feedback" role="status" aria-live="polite">{message || (!view && !error ? 'Loading projects.' : '')}</p>}
        {state.editing && state.editing.kind !== 'ticket' && <p className="editing-note">Save or cancel your changes before switching views.</p>}
        {view && <>
          {composing && <ProjectDialog title={'New ' + composing} locked={busy} onClose={closeComposer}>
            {composing === 'ticket' && milestone
              ? <TicketComposer milestoneId={milestone.id} busy={busy} error={error} onAdd={state.addTicket} onCancel={closeComposer} />
              : composing !== 'ticket' && <EntityComposer kind={composing} busy={busy} error={error}
                  onAdd={composing === 'project' ? state.addProject : state.addMilestone} onCancel={closeComposer} />}
          </ProjectDialog>}
          {project ? (
            <section className="project-detail" aria-label="Selected project" aria-busy={busy}>
              <div className="detail-heading">
                <h2 className="project-heading">{project.title}</h2>
                <div className="project-tools">
                  <PlanDraftPanel key={project.id} projectId={project.id} disabled={locked} onOpenChange={setPlanning} onApproved={() => { void state.refresh(); }} />
                  <PublicationPanel projectId={project.id} disabled={locked} onOpenChange={setPlanning} onChanged={() => { void state.refresh(); }} />
                  <button className="text-button" disabled={locked} onClick={() => state.beginEdit('project', project.id)}>Edit project</button>
                  <button className="secondary-button" disabled={locked} onClick={() => openComposer('milestone')}>New milestone</button>
                </div>
              </div>
              {editor('project', project.id, project)}
              {project.description && <p className="project-description">{project.description}</p>}
              <GitHubConnection key={project.id} projectId={project.id}
                onRepository={value => setRepository(current => current?.projectId === project.id && JSON.stringify(current.value) === JSON.stringify(value)
                  ? current : { projectId: project.id, value })} />
              <div className="project-layout-buttons" role="group" aria-label="Project layout">
                <button type="button" aria-pressed={layout === 'milestones'} disabled={locked} onClick={() => setLayout('milestones')}>Milestones</button>
                <button type="button" aria-pressed={layout === 'board'} disabled={locked} onClick={() => setLayout('board')}>Status board</button>
              </div>
              {layout === 'board' ? <ProjectBoard view={view} renderTicket={renderTicket} /> : milestone ? (
                <>
                  <div className="milestone-picker">
                    <label htmlFor="selected-milestone">Milestone</label>
                    <select id="selected-milestone" value={milestoneId} disabled={locked}
                      onChange={event => state.selectMilestone(event.target.value)}>
                      {view.milestones.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
                    </select>
                    <button className="text-button" disabled={locked} onClick={() => state.beginEdit('milestone', milestone.id)}>Edit milestone</button>
                  </div>
                  {editor('milestone', milestone.id, milestone)}
                  {milestone.description && <p className="project-description">{milestone.description}</p>}
                  <div className="section-heading ticket-list-heading">
                    <h2>Tickets<span>{tickets.length}</span></h2>
                    <button className="primary" disabled={locked} onClick={() => openComposer('ticket')}>New ticket</button>
                  </div>
                  {tickets.length > 0 ? (
                    <ul className="task-list project-ticket-list">
                      {tickets.map(renderTicket)}
                    </ul>
                  ) : <p className="project-empty">No tickets yet. Use New ticket to add the first step.</p>}
                </>
              ) : <p className="project-empty">Use New milestone to break this project into smaller goals.</p>}
            </section>
          ) : <div className="empty"><h3>Your first project starts here</h3><p>Use New project in the sidebar to organize your work.</p></div>}
        </>}
      </main>
    </WorkspaceShell>
  );
}
