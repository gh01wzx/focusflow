import { useState } from 'react';
import type { FormEvent } from 'react';
import type { TicketDraft } from '../../../src/shared/projects.ts';

export function TicketComposer({ milestoneId, busy, onAdd }: {
  milestoneId: string;
  busy: boolean;
  onAdd(draft: TicketDraft): Promise<boolean>;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [acceptanceCriteria, setAcceptanceCriteria] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (await onAdd({ title, description, acceptanceCriteria, milestoneId })) {
      setTitle(''); setDescription(''); setAcceptanceCriteria('');
    }
  }
  return (
    <details className="project-composer">
      <summary>New ticket</summary>
      <form onSubmit={event => void submit(event)}>
        <label htmlFor="ticket-title">Ticket title</label>
        <input id="ticket-title" value={title} onChange={event => setTitle(event.target.value)}
          maxLength={300} required disabled={busy} />
        <label htmlFor="ticket-description">Ticket description</label>
        <textarea id="ticket-description" value={description} onChange={event => setDescription(event.target.value)}
          maxLength={2000} rows={2} disabled={busy} />
        <label htmlFor="ticket-acceptance">Acceptance criteria</label>
        <textarea id="ticket-acceptance" value={acceptanceCriteria}
          onChange={event => setAcceptanceCriteria(event.target.value)} maxLength={2000} rows={3} disabled={busy} />
        <button className="primary" disabled={busy || !title.trim()} type="submit">Add ticket</button>
      </form>
    </details>
  );
}
