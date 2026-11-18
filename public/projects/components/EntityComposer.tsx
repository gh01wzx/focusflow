import { t } from '../../workspace/locale.ts';
import { useState } from 'react';
import type { FormEvent } from 'react';
import type { EntityDraft } from '../../../src/shared/projects.ts';

export function EntityComposer({ kind, busy, error, onAdd, onCancel }: {
  kind: 'project' | 'milestone'; busy: boolean; error: string;
  onAdd(draft: EntityDraft): Promise<boolean>; onCancel(): void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const name = kind === 'project' ? 'Project' : 'Milestone';
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (await onAdd({ title, description })) onCancel();
  }
  return <form className="project-form" aria-label={t('New ') + t(kind)} onSubmit={event => void submit(event)}>
    <label htmlFor={kind + '-title'}>{t(name)} {t("title")}</label>
    <input id={kind + '-title'} value={title} onChange={event => setTitle(event.target.value)}
      maxLength={300} required disabled={busy} autoFocus />
    <label htmlFor={kind + '-description'}>{t(name)} {t("description")}</label>
    <textarea id={kind + '-description'} value={description} onChange={event => setDescription(event.target.value)}
      maxLength={2000} rows={3} disabled={busy} />
    {error && <p role="alert" className="error">{t(error)}</p>}
    <div className="editor-buttons">
      <button className="primary" disabled={busy || !title.trim()} type="submit">{busy ? t('Saving...') : t('Add ') + t(kind)}</button>
      <button className="secondary-button" disabled={busy} type="button" onClick={onCancel}>{t("Cancel")}</button>
    </div>
  </form>;
}
