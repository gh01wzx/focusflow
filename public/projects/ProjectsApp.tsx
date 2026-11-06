import { useState } from 'react';
import { ActionCenter } from './ActionCenter.tsx';
import { WorkspaceShell } from '../workspace/WorkspaceShell.tsx';
import type { WorkspaceProps } from '../workspace/WorkspaceShell.tsx';
import { useProjectsController } from './useProjectsController.ts';
import { EntityComposer } from './components/EntityComposer.tsx';
import { TicketComposer } from './components/TicketComposer.tsx';
import { ManualTicket } from './components/ManualTicket.tsx';

export function ProjectsApp(props: WorkspaceProps) {
  const [browse, setBrowse] = useState(false);
  return browse ? <ProjectHierarchy {...props} onBack={() => setBrowse(false)} />
    : <ActionCenter {...props} onBrowse={() => setBrowse(true)} />;
}
function ProjectHierarchy({ onWorkspaceChange, onBack }: WorkspaceProps & { onBack(): void }) {
  const state = useProjectsController();
  const { view, busy, milestoneId, error, message } = state;
  const project = view?.projects.find(item => item.id === view.selectedProjectId);
  const milestone = view?.milestones.find(item => item.id === milestoneId);
  const tickets = view?.tickets.filter(item => item.milestoneId === milestoneId) ?? [];
  return (
    <WorkspaceShell workspace="projects" busy={busy} onWorkspaceChange={onWorkspaceChange} navigation={
      <nav aria-label="Project list">
        {view?.projects.map(item => (
          <button key={item.id} className={`nav-item ${item.id === project?.id ? 'active' : ''}`}
            aria-current={item.id === project?.id ? 'page' : undefined} disabled={busy}
            onClick={() => void state.selectProject(item.id)}>{item.title}</button>
        ))}
      </nav>
    }>
      <main>
        <button disabled={busy} onClick={onBack}>Action center</button>
        <div className="breadcrumb">Projects {project && <><span>/</span>{project.title}</>}</div>
        <header className="page-header">
          <div>
            <p className="eyebrow">PROJECT WORKSPACE</p>
            <h1>Projects<span className="heading-dot">.</span></h1>
            <p className="subtitle">Small steps toward something bigger.</p>
          </div>
        </header>
        {error && <div className="error" role="alert">{error}
          <button disabled={busy} onClick={() => void state.refresh()}>Retry</button></div>}
        <p className="feedback" role="status" aria-live="polite">{message || (!view && !error ? 'Loading projects.' : '')}</p>
        {view && (
          <>
            <EntityComposer kind="project" busy={busy} initiallyOpen={view.projects.length === 0} onAdd={state.addProject} />
            {project ? (
              <section className="project-detail" aria-label="Selected project" aria-busy={busy}>
                <h2 className="project-heading">{project.title}</h2>
                {project.description && <p className="project-description">{project.description}</p>}
                <EntityComposer key={project.id} kind="milestone" busy={busy}
                  initiallyOpen={view.milestones.length === 0} onAdd={state.addMilestone} />
                {milestone ? (
                  <>
                    <div className="milestone-picker">
                      <label htmlFor="selected-milestone">Milestone</label>
                      <select id="selected-milestone" value={milestoneId} disabled={busy}
                        onChange={event => state.selectMilestone(event.target.value)}>
                        {view.milestones.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
                      </select>
                    </div>
                    {milestone.description && <p className="project-description">{milestone.description}</p>}
                    <TicketComposer key={milestone.id} milestoneId={milestone.id} busy={busy} onAdd={state.addTicket} />
                    <div className="section-heading"><h2>Tickets<span>{tickets.length}</span></h2></div>
                    {tickets.length > 0 ? (
                      <ul className="task-list">
                        {tickets.map(ticket => <ManualTicket key={ticket.id} ticket={ticket} busy={busy} onStatus={state.setStatus} />)}
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
