import { useState } from 'react';
import type { ProjectTicket, ProjectView } from '../../../src/shared/projects.ts';
import { unfinishedPrerequisites } from '../../../src/shared/dependencies.ts';

export function Prerequisites({ ticket, view, busy, onSave, onVisit }: {
  ticket: ProjectTicket; view: ProjectView; busy: boolean;
  onSave(id: string, ids: string[]): Promise<boolean>;
  onVisit(ticket: ProjectTicket): void;
}) {
  const current = view.dependencies.filter(link => link.ticketId === ticket.id).map(link => link.prerequisiteId);
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState(current);
  const blockers = unfinishedPrerequisites(ticket.id, view.tickets, view.dependencies);
  const related = view.tickets.filter(item => current.includes(item.id));
  return <div className="prerequisites">
    <div className="prerequisite-heading">
      <h4>Prerequisites</h4>
      <button className="prerequisite-button" disabled={busy || editing} onClick={() => {
        setSelected(current); setEditing(true);
      }} aria-label={'Set prerequisites for ' + ticket.title}>Set prerequisites</button>
    </div>
    {blockers.length > 0 && <p className="blocker-note">Waiting for {blockers.length} prerequisite{blockers.length === 1 ? '' : 's'}. This ticket cannot start yet.</p>}
    {!editing && (related.length ? <ul>{related.map(item => <li key={item.id}>
      <button className="prerequisite-link" disabled={busy} onClick={() => onVisit(item)}>{item.title}</button>
      <span> {item.status === 'done' ? 'Done' : 'Not done'}</span>
    </li>)}</ul> : <p>No prerequisites.</p>)}
    {editing && <form aria-label={'Prerequisites for ' + ticket.title} onSubmit={event => {
      event.preventDefault();
      void onSave(ticket.id, selected).then(saved => { if (saved) setEditing(false); });
    }}>
      <fieldset disabled={busy}>
        <legend>Finish these tickets first</legend>
        {view.tickets.filter(item => item.id !== ticket.id).map(item => <label key={item.id}>
          <input type="checkbox" checked={selected.includes(item.id)} onChange={event => setSelected(ids => event.target.checked
            ? [...ids, item.id] : ids.filter(id => id !== item.id))} />
          {item.title} <small> / {view.milestones.find(m => m.id === item.milestoneId)?.title}</small>
        </label>)}
        {view.tickets.length < 2 && <p>Add another ticket in this project to choose a prerequisite.</p>}
      </fieldset>
      <div className="prerequisite-buttons">
        <button className="primary" disabled={busy}>Save prerequisites</button>
        <button type="button" disabled={busy} onClick={() => setEditing(false)}>Cancel</button>
      </div>
    </form>}
  </div>;
}
