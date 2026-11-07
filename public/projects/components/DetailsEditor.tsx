import { useState } from 'react';
import type { FormEvent } from 'react';
import type { EntityDraft, TicketDetailsDraft } from '../../../src/shared/projects.ts';

export type EditKind = 'project' | 'milestone' | 'ticket';

export function DetailsEditor({ kind, initial, acceptanceCriteria = '', busy, error, onSave, onCancel }: {
  kind: EditKind;
  initial: EntityDraft;
  acceptanceCriteria?: string;
  busy: boolean;
  error: string;
  onSave(draft: TicketDetailsDraft): Promise<boolean>;
  onCancel(): void;
}) {
  const [title, setTitle] = useState(initial.title);
  const [description, setDescription] = useState(initial.description);
  const [acceptance, setAcceptance] = useState(acceptanceCriteria);
  const prefix = 'edit-' + kind;
  function submit(event: FormEvent) {
    event.preventDefault();
    void onSave({ title, description, acceptanceCriteria: acceptance });
  }
  return <form className="details-editor" aria-label={'Edit ' + kind} onSubmit={submit}>
    <h3>Edit {kind}</h3>
    <label htmlFor={prefix + '-title'}>Edit {kind} title</label>
    <input id={prefix + '-title'} value={title} onChange={event => setTitle(event.target.value)}
      maxLength={300} required disabled={busy} autoFocus />
    <label htmlFor={prefix + '-description'}>Edit {kind} description</label>
    <textarea id={prefix + '-description'} value={description} onChange={event => setDescription(event.target.value)}
      maxLength={2000} rows={3} disabled={busy} />
    {kind === 'ticket' && <>
      <label htmlFor={prefix + '-acceptance'}>Edit ticket acceptance criteria</label>
      <textarea id={prefix + '-acceptance'} value={acceptance} onChange={event => setAcceptance(event.target.value)}
        maxLength={2000} rows={3} disabled={busy} />
    </>}
    {error && <p role="alert" className="error">{error}</p>}
    <div className="editor-buttons">
      <button className="primary" type="submit" disabled={busy || !title.trim()}>{busy ? 'Saving...' : 'Save changes'}</button>
      <button className="secondary-button" type="button" disabled={busy} onClick={onCancel}>Cancel</button>
    </div>
  </form>;
}
