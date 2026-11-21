import { t } from '../../workspace/locale.ts';
import { useEffect, useRef, useState } from 'react';
import { addDays, localDay } from '../../../src/shared/calendar.ts';
import { addSomeday, readSomeday, removeSomeday, scheduleSomeday } from '../../../src/client/someday.ts';
import type { SomedayItem } from '../../../src/shared/someday.ts';
import { dateText } from '../view-options.ts';
import { CalendarIcon, CloseIcon, PlusIcon } from './Icons.tsx';

// Loads the Someday list once, so the sidebar count and the weekly review can show it too.
export function useSomeday(onPlanned: (title: string, date: string) => void) {
  const [items, setItems] = useState<SomedayItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    void readSomeday().then(value => { if (mounted.current) setItems(value); }).catch(() => { if (mounted.current) setError('Could not read the Someday list.'); });
    return () => { mounted.current = false; };
  }, []);
  async function run(work: () => Promise<SomedayItem[]>) {
    setBusy(true); setError('');
    try { const next = await work(); if (mounted.current) setItems(next); return true; }
    catch (failure) { if (mounted.current) setError(failure instanceof Error ? failure.message : 'Could not save.'); return false; }
    finally { if (mounted.current) setBusy(false); }
  }
  return {
    items, busy, error,
    add: (title: string) => run(() => addSomeday(title)),
    remove: (id: string) => run(() => removeSomeday(id)),
    async schedule(item: SomedayItem, date: string) {
      if (await run(() => scheduleSomeday(item.id, date))) onPlanned(item.title, date);
    },
  };
}
export type SomedayController = ReturnType<typeof useSomeday>;

// Ideas without a date. Capturing one keeps it off Today; planning one makes it a task on a date.
export function SomedayList({ state, today, disabled }: { state: SomedayController; today: string; disabled: boolean }) {
  const [draft, setDraft] = useState('');
  const [picking, setPicking] = useState<{ id: string; date: string } | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const busy = disabled || state.busy;
  return <div className="someday">
    <form className="quick-add glass" onSubmit={async event => {
      event.preventDefault();
      if (draft.trim() && await state.add(draft)) setDraft('');
    }}>
      <span className="quick-plus" aria-hidden="true"><PlusIcon /></span>
      <input aria-label={t("Someday idea")} value={draft} maxLength={300} disabled={busy} autoComplete="off"
        placeholder={t("Write down an idea for later and press Enter")} onChange={event => setDraft(event.target.value)} />
    </form>
    {state.error && <p className="error" role="alert">{t(state.error)}</p>}
    {state.items.length === 0 ? <div className="empty glass">
      <span className="empty-icon"><CalendarIcon /></span>
      <h3>{t("Nothing waiting for later")}</h3>
      <p>{t("Keep ideas that are not urgent here, so Today stays clear. The weekly review reminds you to plan one or two.")}</p>
    </div> : <section className="list-group glass" aria-label={t("Someday")}>
      <ul className="task-list">{state.items.map(item => <li key={item.id} className="row-item">
        <div className="task someday-row">
          <div className="task-content">
            <span className="task-title">{item.title}</span>
            <div className="task-meta">{t("Noted {0}", dateText(localDay(new Date(item.createdAt))))}</div>
            {picking?.id === item.id && <form className="someday-pick" onSubmit={event => {
              event.preventDefault(); void state.schedule(item, picking.date).then(() => setPicking(null));
            }} onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); setPicking(null); } }}>
              <label className="field">{t("Plan for")}
                <input type="date" value={picking.date} min={today} required autoFocus disabled={busy}
                  onChange={event => setPicking({ id: item.id, date: event.target.value })} /></label>
              <div className="log-actions">
                <button type="button" className="secondary-button" onClick={() => setPicking(null)}>{t("Cancel")}</button>
                <button className="primary" disabled={busy}>{t("Plan")}</button>
              </div>
            </form>}
            {confirming === item.id && <div className="confirm-actions" role="group" aria-label={t("Delete {0}?", item.title)}>
              <span>{t("Delete this idea?")}</span>
              <button className="danger-button" disabled={busy} onClick={() => { setConfirming(null); void state.remove(item.id); }}>{t("Delete")}</button>
              <button className="secondary-button" disabled={busy} onClick={() => setConfirming(null)}>{t("Keep")}</button>
            </div>}
          </div>
          {picking?.id !== item.id && confirming !== item.id && <div className="someday-actions">
            <button type="button" className="quiet-button" disabled={busy} onClick={() => void state.schedule(item, today)}>{t("Today")}</button>
            <button type="button" className="text-button" disabled={busy} onClick={() => setPicking({ id: item.id, date: addDays(today, 1) })}>{t("Pick a date")}</button>
            <button type="button" className="icon-button" disabled={busy} aria-label={t("Delete {0}", item.title)} title={t("Delete")}
              onClick={() => setConfirming(item.id)}><CloseIcon /></button>
          </div>}
        </div>
      </li>)}</ul>
    </section>}
  </div>;
}
