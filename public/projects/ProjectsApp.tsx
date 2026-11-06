import { useState } from 'react';
import { ActionCenter } from './ActionCenter.tsx';
import { WorkspaceShell } from '../workspace/WorkspaceShell.tsx';
import type { WorkspaceProps } from '../workspace/WorkspaceShell.tsx';
import { useProjectsController } from './useProjectsController.ts';
import { EntityComposer } from './components/EntityComposer.tsx';
import { TicketComposer } from './components/TicketComposer.tsx';
import { ManualTicket } from './components/ManualTicket.tsx';
import { ProjectNavigation } from './components/ProjectNavigation.tsx';
import { DetailsEditor } from './components/DetailsEditor.tsx';
import type { EntityDraft } from '../../src/shared/projects.ts';
import type { EditKind } from './components/DetailsEditor.tsx';

export function ProjectsApp(props: WorkspaceProps) {
  const [destination, setDestination] = useState<{ projectId?: string } | null>(null);
  return destination ? <ProjectHierarchy {...props} initialProjectId={destination.projectId} onBack={() => setDestination(null)} />
    : <ActionCenter {...props} onProject={projectId => setDestination({ projectId })} onNewProject={() => setDestination({})} />;
}
function ProjectHierarchy({ onWorkspaceChange, onBack, initialProjectId }: WorkspaceProps & { onBack(): void; initialProjectId: string | undefined }) {
  const state = useProjectsController(initialProjectId);
  const [projectFormRequest, setProjectFormRequest] = useState(initialProjectId === undefined ? 1 : 0);
  const { view, busy, milestoneId, error, message } = state;
  const locked = busy || !!state.editing;
  const project = view?.projects.find(item => item.id === view.selectedProjectId);
  const milestone = view?.milestones.find(item => item.id === milestoneId);
  const tickets = view?.tickets.filter(item => item.milestoneId === milestoneId) ?? [];
  function editor(kind: EditKind, id: string, initial: EntityDraft, acceptanceCriteria = '') {
    return state.editing?.kind === kind && state.editing.id === id
      ? <DetailsEditor key={kind + id} kind={kind} initial={initial} acceptanceCriteria={acceptanceCriteria}
          busy={busy} error={error} onSave={state.saveEdit} onCancel={state.cancelEdit} /> : null;
  }
  return (
    <WorkspaceShell workspace="projects" busy={locked} onWorkspaceChange={onWorkspaceChange} navigation={
      <ProjectNavigation projects={view?.projects ?? []} selectedId={project?.id} busy={locked}
        onOverview={onBack} onProject={id => { void state.selectProject(id); }}
        onNewProject={() => setProjectFormRequest(value => value + 1)} />
    }>
      <main>
        <div className="breadcrumb">Projects {project && <><span>/</span>{project.title}</>}</div>
        <header className="page-header">
          <div>
            <p className="eyebrow">PROJECT WORKSPACE</p>
            <h1>Projects<span className="heading-dot">.</span></h1>
            <p className="subtitle">Small steps toward something bigger.</p>
          </div>
        </header>
        {error && !state.editing && <div className="error" role="alert">{error}
          <button disabled={busy} onClick={() => void state.refresh()}>Retry</button></div>}
        <p className="feedback" role="status" aria-live="polite">{message || (!view && !error ? 'Loading projects.' : '')}</p>
        {state.editing && <p className="editing-note">Save or cancel your changes before switching views.</p>}
        {view && (
          <>
            <EntityComposer kind="project" busy={locked} initiallyOpen={view.projects.length === 0}
              openRequest={projectFormRequest} onAdd={state.addProject} />
            {project ? (
              <section className="project-detail" aria-label="Selected project" aria-busy={busy}>
                <div className="detail-heading">
                  <h2 className="project-heading">{project.title}</h2>
                  <button className="text-button" disabled={locked} onClick={() => state.beginEdit('project', project.id)}>Edit project</button>
                </div>
                {editor('project', project.id, project)}
                {project.description && <p className="project-description">{project.description}</p>}
                <EntityComposer key={project.id} kind="milestone" busy={locked}
                  initiallyOpen={view.milestones.length === 0} onAdd={state.addMilestone} />
                {milestone ? (
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
                    <TicketComposer key={milestone.id} milestoneId={milestone.id} busy={locked} onAdd={state.addTicket} />
                    <div className="section-heading"><h2>Tickets<span>{tickets.length}</span></h2></div>
                    {tickets.length > 0 ? (
                      <ul className="task-list">
                        {tickets.map(ticket => <ManualTicket key={ticket.id} ticket={ticket} busy={locked} onStatus={state.setStatus}
                          onEdit={() => state.beginEdit('ticket', ticket.id)}
                          editor={editor('ticket', ticket.id, ticket, ticket.acceptanceCriteria)} />)}
                      </ul>
                    ) : <p className="project-empty">Add a ticket to plan the next step for this milestone.</p>}
                  </>
                ) : <p className="project-empty">Add a milestone to break this project into smaller goals.</p>}
              </section>
            ) : <div className="empty"><h3>Your first project starts here</h3><p>Create a project above to organize your work.</p></div>}
          </>
        )}
      </main>
    </WorkspaceShell>
  );
}
