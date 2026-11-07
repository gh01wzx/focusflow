import { useState } from 'react';
import type { FormEvent } from 'react';
import type { TicketDraft, ExecutionMode } from '../../../src/shared/projects.ts';
import { ExecutionChoice } from './ExecutionChoice.tsx';

export function TicketComposer({ milestoneId, busy, error, onAdd, onCancel }: {
  milestoneId: string; busy: boolean; error: string;
  onAdd(draft: TicketDraft): Promise<boolean>; onCancel(): void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [acceptanceCriteria, setAcceptanceCriteria] = useState('');
  const [executionMode, setExecutionMode] = useState<ExecutionMode>('manual');
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (await onAdd({ title, description, acceptanceCriteria, milestoneId, executionMode })) onCancel();
  }
  return <form className="project-form" aria-label="New ticket" onSubmit={event => void submit(event)}>
    <label htmlFor="ticket-title">Ticket title</label>
    <input id="ticket-title" value={title} onChange={event => setTitle(event.target.value)}
      maxLength={300} required disabled={busy} autoFocus />
    <label htmlFor="ticket-description">Ticket description</label>
    <textarea id="ticket-description" value={description} onChange={event => setDescription(event.target.value)}
      maxLength={2000} rows={3} disabled={busy} />
    <label htmlFor="ticket-acceptance">Acceptance criteria</label>
    <textarea id="ticket-acceptance" value={acceptanceCriteria} onChange={event => setAcceptanceCriteria(event.target.value)}
      maxLength={2000} rows={3} disabled={busy} />
    <ExecutionChoice id="ticket-work-type" value={executionMode} disabled={busy} onChange={setExecutionMode} />
    {error && <p role="alert" className="error">{error}</p>}
    <div className="editor-buttons">
      <button className="primary" disabled={busy || !title.trim()} type="submit">{busy ? 'Saving...' : 'Add ticket'}</button>
      <button className="secondary-button" disabled={busy} type="button" onClick={onCancel}>Cancel</button>
    </div>
  </form>;
}
