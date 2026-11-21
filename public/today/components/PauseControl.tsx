import { t } from '../../workspace/locale.ts';
import { useState } from 'react';
import { addDays } from '../../../src/shared/calendar.ts';
import type { PersonalController } from '../usePersonal.ts';
import { dateText } from '../view-options.ts';

// Starts a pause for sick days or travel: habits rest from today until the chosen day.
export function PauseControl({ state }: { state: PersonalController }) {
  const [until, setUntil] = useState<string | null>(null);
  const data = state.data;
  if (!data || (data.pause && data.pause.start <= data.day)) return null;
  if (until === null) return <button type="button" className="text-button pause-open" disabled={state.busy}
    onClick={() => setUntil(addDays(data.day, 2))}>{t("Pause habits")}</button>;
  return <form className="pause-form" onSubmit={async event => {
    event.preventDefault();
    if (await state.mutate('pause', { until })) setUntil(null);
  }} onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); setUntil(null); } }}>
    <label className="field">{t("Pause habits until")}
      <input type="date" value={until} min={data.day} max={addDays(data.day, 90)} required autoFocus disabled={state.busy}
        onChange={event => setUntil(event.target.value)} /></label>
    <p className="group-note">{t("Paused days count as rest days, so no chain breaks. Repeating tasks continue.")}</p>
    <div className="log-actions">
      <button type="button" className="secondary-button" onClick={() => setUntil(null)}>{t("Cancel")}</button>
      <button className="primary" disabled={state.busy}>{t("Pause")}</button>
    </div>
  </form>;
}

// Shown at the top of Today while habits are paused.
export function PauseBanner({ state }: { state: PersonalController }) {
  const data = state.data;
  if (!data?.pause || data.pause.start > data.day) return null;
  return <div className="pause-banner glass" role="status">
    <p><strong>{t("Habits paused until {0}.", dateText(data.pause.end))}</strong> {t("These days count as rest days.")}</p>
    <button type="button" className="secondary-button" disabled={state.busy} onClick={() => void state.mutate('resume', {})}>{t("Resume now")}</button>
  </div>;
}
