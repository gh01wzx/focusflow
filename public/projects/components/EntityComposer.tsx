import { useState } from 'react';
import type { FormEvent } from 'react';
import type { EntityDraft } from '../../../src/shared/projects.ts';

interface EntityComposerProps {
  kind: 'project' | 'milestone';
  busy: boolean;
  initiallyOpen: boolean;
  onAdd(draft: EntityDraft): Promise<boolean>;
}

export function EntityComposer({ kind, busy, initiallyOpen, onAdd }: EntityComposerProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const name = kind === 'project' ? 'Project' : 'Milestone';
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (await onAdd({ title, description })) { setTitle(''); setDescription(''); }
  }
  return (
    <details className="project-composer" open={initiallyOpen || undefined}>
      <summary>New {kind}</summary>
      <form onSubmit={event => void submit(event)}>
        <label htmlFor={kind + '-title'}>{name} title</label>
        <input id={kind + '-title'} value={title} onChange={event => setTitle(event.target.value)}
          maxLength={300} required disabled={busy} />
        <label htmlFor={kind + '-description'}>{name} description</label>
        <textarea id={kind + '-description'} value={description} onChange={event => setDescription(event.target.value)}
          maxLength={2000} rows={2} disabled={busy} />
        <button className="primary" disabled={busy || !title.trim()} type="submit">Add {kind}</button>
      </form>
    </details>
  );
}
