import { WorkspaceShell } from '../workspace/WorkspaceShell.tsx';
import type { WorkspaceProps } from '../workspace/WorkspaceShell.tsx';
import { projectActions } from '../../src/shared/actions.ts';
import type { ActionTicket } from '../../src/shared/actions.ts';
import { useActionsController } from './useActionsController.ts';
export function ActionCenter({ onWorkspaceChange, onBrowse }: WorkspaceProps & { onBrowse(): void }) {
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
      {recommended && <button disabled={state.busy} onClick={() => void state.start(item.ticket.id)}>Start ticket</button>}
    </li>;
  }
  return <WorkspaceShell workspace="projects" busy={state.busy} onWorkspaceChange={onWorkspaceChange}
    navigation={<button className="nav-item" disabled={state.busy} onClick={onBrowse}>Browse projects</button>}>
    <main>
      <header className="page-header"><div><p className="eyebrow">ACROSS ALL PROJECTS</p>
        <h1>Action center<span className="heading-dot">.</span></h1>
        <p className="subtitle">Review your work, then choose the next step.</p></div></header>
      {state.error && <div role="alert" className="error">{state.error}
        <button disabled={state.busy} onClick={() => void state.refresh()}>Retry</button></div>}
      <p role="status" className="feedback">{state.message || (!state.views && !state.error ? 'Loading project actions.' : '')}</p>
      {state.views && <>
        <section aria-label="Review"><h2>Review</h2>{actions.review.length
          ? <ul className="action-list">{actions.review.map(item => card(item))}</ul> : <p>No tickets waiting for review.</p>}</section>
        <section aria-label="In progress"><h2>In progress</h2>{actions.active.length
          ? <ul className="action-list">{actions.active.map(item => card(item))}</ul> : <p>No tickets in progress.</p>}</section>
        <section aria-label="Next task"><h2>Next task</h2>
          <p>Ready tasks, oldest created first. Equal timestamps keep a stable order.</p>
          <p>Only mark a task Ready when its prerequisites are finished.</p>
          {actions.next ? <ul className="action-list">{card(actions.next, true)}</ul>
            : <p>No Ready task yet. Browse projects to create a ticket or mark one Ready.</p>}</section>
      </>}
    </main>
  </WorkspaceShell>;
}
