import { t } from '../../workspace/locale.ts';
import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { PlusIcon } from './Icons.tsx';

// The fastest path: type a task for today and press Enter. The full window is one click away.
export function QuickAdd({ disabled, onAdd, onMore }: {
  disabled: boolean; onAdd(title: string): Promise<string>; onMore(title: string): void;
}) {
  const [title, setTitle] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  async function submit(event: FormEvent) {
    event.preventDefault();
    const text = title.trim();
    if (!text || saving || disabled) return;
    setSaving(true); setError('');
    const failure = await onAdd(text);
    setSaving(false);
    if (failure) setError(failure);
    else { setTitle(''); input.current?.focus(); }
  }
  return <form className="quick-add glass" aria-label={t("Quick add")} onSubmit={event => void submit(event)}>
    <span className="quick-plus" aria-hidden="true"><PlusIcon /></span>
    <input ref={input} aria-label={t("Add a task for today")} placeholder={t("Add a task for today, then press Enter")} value={title}
      maxLength={300} autoComplete="off" readOnly={saving} onChange={event => setTitle(event.target.value)} />
    {title.trim() && <button type="submit" className="quiet-button" disabled={disabled || saving}>{t("Add")}</button>}
    <button type="button" className="text-button" disabled={disabled || saving} onClick={() => onMore(title.trim())}>{t("More options")}</button>
    {error && <p role="alert" className="error">{t(error)}</p>}
  </form>;
}
