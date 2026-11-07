import { useState } from 'react';
import type { ProjectTicket, ProjectView } from '../../../src/shared/projects.ts';
import { unfinishedPrerequisites } from '../../../src/shared/dependencies.ts';

export function Prerequisites({ ticket, view, busy, onEditingChange, onSave, onVisit }: {
  ticket: ProjectTicket; view: ProjectView; busy: boolean;
  onEditingChange(editing: boolean): void;
  onSave(id: string, ids: string[]): Promise<boolean>;
  onVisit(ticket: ProjectTicket): void;
}) {
  const current = view.dependencies.filter(link => link.ticketId === ticket.id).map(link => link.prerequisiteId);
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState(current);
  const blockers = unfinishedPrerequisites(ticket.id, view.tickets, view.dependencies);
  const related = view.tickets.filter(item => current.includes(item.id));
  const changed = selected.length !== current.length || selected.some(id => !current.includes(id));
  return <div className="prerequisites">
    <div className="prerequisite-heading">
      <h3>Prerequisites</h3>
      {!editing && <button className="secondary-button" disabled={busy} onClick={() => {
        setSelected(current); setEditing(true); onEditingChange(true);
      }} aria-label={'Set prerequisites for ' + ticket.title}>Set prerequisites</button>}
    </div>
    {blockers.length > 0 && <p className="blocker-note">Waiting for {blockers.length} prerequisite{blockers.length === 1 ? '' : 's'}. This ticket cannot start yet.</p>}
    {!editing && (related.length ? <ul>{related.map(item => <li key={item.id}>
      <button className="secondary-button prerequisite-link" disabled={busy} onClick={() => onVisit(item)}>{item.title}</button>
      <span> {item.status === 'done' ? 'Done' : 'Not done'}</span>
    </li>)}</ul> : <p>No prerequisites.</p>)}
    {editing && <form aria-label={'Prerequisites for ' + ticket.title} onSubmit={event => {
      event.preventDefault();
      void onSave(ticket.id, selected).then(saved => {
        if (saved) { setEditing(false); onEditingChange(false); }
      });
    }}>
      <fieldset disabled={busy}>
        <legend>Finish these tickets first</legend>
        <div className="prerequisite-options">
          {view.tickets.filter(item => item.id !== ticket.id).map(item => {
            const chosen = selected.includes(item.id);
            const milestone = view.milestones.find(m => m.id === item.milestoneId)?.title ?? '';
            return <button key={item.id} type="button" className="prerequisite-option"
              aria-label={item.title + ' / ' + milestone} aria-pressed={chosen}
              onClick={() => setSelected(ids => chosen ? ids.filter(id => id !== item.id) : [...ids, item.id])}>
              <span className="prerequisite-option-details"><span>{item.title}</span><small>{milestone}</small></span>
              <span className="prerequisite-choice-state" aria-hidden="true">{chosen ? 'Selected' : 'Select'}</span>
            </button>;
          })}
        </div>
        {view.tickets.length < 2 && <p>Add another ticket in this project to choose a prerequisite.</p>}
      </fieldset>
      <div className="prerequisite-buttons">
        <button type="submit" className="primary" disabled={busy || !changed}>Save prerequisites</button>
        <button type="button" className="secondary-button" disabled={busy} onClick={() => { setEditing(false); onEditingChange(false); }}>Cancel</button>
      </div>
    </form>}
  </div>;
}
