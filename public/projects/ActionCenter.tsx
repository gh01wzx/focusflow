import { WorkspaceShell } from '../workspace/WorkspaceShell.tsx';
import type { WorkspaceProps } from '../workspace/WorkspaceShell.tsx';
import { projectActions } from '../../src/shared/actions.ts';
import type { ActionTicket } from '../../src/shared/actions.ts';
import { useActionsController } from './useActionsController.ts';
import { ProjectNavigation } from './components/ProjectNavigation.tsx';
export function ActionCenter({ onWorkspaceChange, onProject, onNewProject }: WorkspaceProps & {
  onProject(id: string): void; onNewProject(): void;
}) {
  const state = useActionsController();
  const actions = projectActions(state.views ?? []);
  function card(item: ActionTicket, recommended = false) {
    return <li className="action-card" key={item.ticket.id}>
      <p className="eyebrow">{item.project} / {item.milestone}</p>
      <h3>{item.ticket.title}</h3>
      <p>Created {new Date(item.ticket.createdAt).toLocaleString()}</p>
      <details><summary>View details</summary>
        <h4>Description</h4><p className="action-text">{item.ticket.description || 'No description yet.'}</p>
        <h4>Acceptance criteria</h4><p className="action-text">{item.ticket.acceptanceCriteria || 'No acceptance criteria yet.'}</p>
      </details>
      {recommended && <button className="primary" disabled={state.busy} onClick={() => void state.start(item.ticket.id)}>Start ticket</button>}
    </li>;
  }
  return <WorkspaceShell workspace="projects" busy={state.busy} onWorkspaceChange={onWorkspaceChange}
    navigation={<ProjectNavigation projects={state.views?.flatMap(view => view.projects) ?? []} overview busy={state.busy}
      onOverview={() => {}} onProject={onProject} onNewProject={onNewProject} />}>
    <main className="actions-main">
      <header className="page-header"><div><p className="eyebrow">ACROSS ALL PROJECTS</p>
        <h1>Action center<span className="heading-dot">.</span></h1>
        <p className="subtitle">Review your work, then choose the next step.</p></div></header>
      {state.error && <div role="alert" className="error">{state.error}
        <button disabled={state.busy} onClick={() => void state.refresh()}>Retry</button></div>}
      <p role="status" className="feedback">{state.message || (!state.views && !state.error ? 'Loading project actions.' : '')}</p>
      {state.views && <div className="action-board" role="region" aria-label="Project actions" tabIndex={0}>
        <section className="action-column review-column" aria-label="Review">
          <header className="action-column-heading"><h2>Review</h2><span className="count">{actions.review.length}</span></header>
          <p className="action-hint">Check finished work.</p>{actions.review.length
          ? <ul className="action-list">{actions.review.map(item => card(item))}</ul> : <p className="action-empty">No tickets waiting for review.</p>}</section>
        <section className="action-column progress-column" aria-label="In progress">
          <header className="action-column-heading"><h2>In progress</h2><span className="count">{actions.active.length}</span></header>
          <p className="action-hint">Work you have already started.</p>{actions.active.length
          ? <ul className="action-list">{actions.active.map(item => card(item))}</ul> : <p className="action-empty">No tickets in progress.</p>}</section>
        <section className="action-column next-column" aria-label="Next task">
          <header className="action-column-heading"><h2>Next task</h2><span className="count">{actions.next ? 1 : 0}</span></header>
          <p className="action-hint">One Ready task with finished prerequisites, oldest created first.</p>
          {actions.next ? <ul className="action-list">{card(actions.next, true)}</ul>
            : <p className="action-empty">No eligible Ready task. Select a project to inspect prerequisites or prepare a Ready ticket.</p>}
          <p className="action-hint action-order">Equal timestamps keep a stable order. Finishing prerequisites never starts another task automatically.</p>
        </section>
      </div>}
    </main>
  </WorkspaceShell>;
}
