import { t } from '../../workspace/locale.ts';
import { useMemo, useState } from 'react';
import { points } from '../../../src/shared/personal.ts';
import type { ActivityEntry, Reward } from '../../../src/shared/personal.ts';
import type { PersonalController } from '../usePersonal.ts';
import { PAGE, ShowMore } from './ShowMore.tsx';

function RewardForm({ initial, state, onClose }: { initial: Reward; state: PersonalController; onClose: () => void }) {
  const [draft, setDraft] = useState(initial);
  const [cost, setCost] = useState(String(initial.cost / 100));
  return <form className="inline-settings reward-form glass" onSubmit={async event => {
    event.preventDefault();
    if (await state.mutate('reward', { ...draft, cost: Math.round(Number(cost) * 100) })) onClose();
  }}>
    <label>{t("Name")} <input required maxLength={160} value={draft.title} autoFocus onChange={event => setDraft({ ...draft, title: event.target.value })} /></label>
    <label>{t("Cost")} <input type="number" required min=".01" max="1000000" step=".01" value={cost} onChange={event => setCost(event.target.value)} /></label>
    <label>{t("Note")} <input value={draft.note} maxLength={500} onChange={event => setDraft({ ...draft, note: event.target.value })} /></label>
    <label className="check-label"><input type="checkbox" checked={draft.onceOnly} onChange={event => setDraft({ ...draft, onceOnly: event.target.checked })} /> {t("Redeem once")}</label>
    <button className="primary" disabled={state.busy}>{t("Save reward")}</button>
    <button type="button" className="secondary-button" disabled={state.busy} onClick={onClose}>{t("Cancel")}</button>
  </form>;
}

export function RewardShop({ state }: { state: PersonalController }) {
  const [editing, setEditing] = useState<Reward>();
  const [redeeming, setRedeeming] = useState<{ item: Reward; id: string }>();
  // Archived rewards leave the shop for good, so archiving takes a second click.
  const [archiving, setArchiving] = useState<string>();
  const data = state.data;
  if (!data) return <p className="feedback" role="status">{state.error ? '' : t('Loading rewards.')}</p>;
  return <section className="rewards-shop" aria-label={t("Rewards shop")}>
    <div className="rewards-heading glass">
      <p><strong>{points(data.balance)}</strong> {t("points available")}</p>
      <p className="group-note">{t("Choose rewards you genuinely look forward to. They make the habit worth repeating.")}</p>
      {!editing && <button className="primary" disabled={state.busy} onClick={() => setEditing({
        id: crypto.randomUUID(), title: '', cost: 3000, note: '', onceOnly: false, archived: false, used: false,
      })}>{t("Add reward")}</button>}
    </div>
    {editing && <RewardForm key={editing.id} initial={editing} state={state} onClose={() => setEditing(undefined)} />}
    {data.rewards.length === 0 && !editing && <p className="list-note">{t("Add a reward to work toward, such as a favorite meal or an hour of gaming.")}</p>}
    {data.rewards.length > 0 && <ul className="reward-list glass">{data.rewards.map(item => {
      const share = Math.min(1, Math.max(0, data.balance) / item.cost);
      return <li className="reward-row" key={item.id}>
        <div className="reward-info">
          <strong>{item.title}</strong>
          <p>{points(item.cost)} {t("points")}{item.note ? ' · ' + item.note : ''}{data.preferences.pinnedReward === item.id ? t(' · Pinned') : ''}</p>
          <span className="meter" aria-hidden="true"><span style={{ transform: `scaleX(${share})` }} /></span>
        </div>
        {redeeming?.item.id === item.id ? <div className="confirm-actions">
          <button className="primary" disabled={state.busy} onClick={async () => {
            if (await state.mutate('redeem', { id: redeeming.id, subject: item.id, cost: redeeming.item.cost })) setRedeeming(undefined);
          }}>{t("Spend")} {points(redeeming.item.cost)} {t("points")}</button>
          <button className="secondary-button" disabled={state.busy} onClick={() => setRedeeming(undefined)}>{t("Cancel")}</button>
        </div> : archiving === item.id ? <div className="confirm-actions" role="group" aria-label={t("Archive {0}?", item.title)}>
          <span>{t("Remove from the shop? History stays.")}</span>
          <button className="danger-button" disabled={state.busy} onClick={async () => {
            if (await state.mutate('reward', { ...item, archived: true })) setArchiving(undefined);
          }}>{t("Archive")}</button>
          <button className="secondary-button" disabled={state.busy} onClick={() => setArchiving(undefined)}>{t("Keep")}</button>
        </div> : <div className="reward-actions">
          <button className="primary" disabled={state.busy || data.balance < item.cost || (item.onceOnly && item.used)}
            onClick={() => setRedeeming({ item, id: crypto.randomUUID() })}>
            {item.onceOnly && item.used ? t('Redeemed') : data.balance < item.cost ? points(item.cost - data.balance) + ' points to go' : t('Redeem')}
          </button>
          <button className="quiet-button" disabled={state.busy} onClick={() => setEditing(item)}>{t("Edit")}</button>
          <button className="quiet-button" disabled={state.busy} onClick={() => void state.mutate('pin', {
            pinnedReward: data.preferences.pinnedReward === item.id ? '' : item.id,
          })}>{data.preferences.pinnedReward === item.id ? t('Unpin') : t('Pin')}</button>
          <button className="quiet-button" disabled={state.busy} aria-label={t("Archive {0}", item.title)}
            onClick={() => setArchiving(item.id)}>{t("Archive")}</button>
        </div>}
      </li>;
    })}</ul>}
    <ActivityHistory state={state} />
  </section>;
}

export function ActivityHistory({ state }: { state: PersonalController }) {
  const [edit, setEdit] = useState<{ entry: ActivityEntry; id: string; minutes: string; day: string }>();
  // Undo is permanent for that entry, so it takes a second click.
  const [undoing, setUndoing] = useState<string>();
  // The newest entries first; older ones on request.
  const [limit, setLimit] = useState(PAGE);
  const entries = state.data?.entries;
  // One pass over the ledger instead of searching it again for every row.
  const adjustments = useMemo(() => {
    const reversed = new Set<string>(), minutes = new Map<string, number>();
    for (const item of entries ?? []) {
      if (!item.reference) continue;
      if (item.kind === 'reverse') reversed.add(item.reference);
      minutes.set(item.reference, (minutes.get(item.reference) ?? 0) + item.minutes);
    }
    return { reversed, minutes };
  }, [entries]);
  return <section className="activity-history"><h2>{t("Points history")}</h2>
    {!entries?.length && <p className="list-note">{t("No points activity yet.")}</p>}
    {!!entries?.length && <ul className="reward-list glass">{entries.slice(0, limit).map(entry => {
      const undone = adjustments.reversed.has(entry.id);
      const original = entry.kind === 'earn' || entry.kind === 'redeem';
      return <li key={entry.id} className="reward-row">
        <div className="reward-info"><strong>{entry.title}</strong><p>{[entry.day,
          t(entry.kind === 'reverse' ? 'Undone' : entry.kind === 'edit' ? 'Corrected' : entry.kind === 'redeem' ? 'Redeemed' : 'Earned'),
          t('{0} points', (entry.amount > 0 ? '+' : '') + points(entry.amount)), entry.minutes ? entry.minutes + ' ' + t(entry.unit === 'count' ? 'counts' : 'min') : ''].filter(Boolean).join(' · ')}</p></div>
        {original && !undone && (undoing === entry.id ? <div className="confirm-actions" role="group" aria-label={t("Undo {0}?", entry.title)}>
          <span>{entry.kind === 'redeem' ? t('Refund these points?') : t('Remove these points?')}</span>
          <button className="danger-button" disabled={state.busy} onClick={async () => {
            if (await state.mutate('reverse', { subject: entry.id, id: crypto.randomUUID() })) setUndoing(undefined);
          }}>{t("Undo")}</button>
          <button className="secondary-button" disabled={state.busy} onClick={() => setUndoing(undefined)}>{t("Keep")}</button>
        </div> : <div className="reward-actions">
          {entry.minutes > 0 && <button className="quiet-button" disabled={state.busy} onClick={() => setEdit({
            entry, id: crypto.randomUUID(), day: entry.day, minutes: String(entry.minutes + (adjustments.minutes.get(entry.id) ?? 0)),
          })}>{t("Correct log")}</button>}
          <button className="quiet-button" disabled={state.busy} onClick={() => setUndoing(entry.id)}>{t("Undo")}</button>
        </div>)}
        {edit?.entry.id === entry.id && <form className="inline-settings" onSubmit={async event => {
          event.preventDefault();
          if (await state.mutate('edit', { subject: entry.id, id: edit.id, day: edit.day, minutes: Number(edit.minutes) })) setEdit(undefined);
        }}><label>{t(entry.unit === 'count' ? "Counts" : "Minutes")} <input type="number" min="1" max="1440" step="1" required value={edit.minutes}
          onChange={event => setEdit({ ...edit, minutes: event.target.value })} /></label>
          <label>{t("Activity date")} <input type="date" required value={edit.day} max={state.data?.day}
            onChange={event => setEdit({ ...edit, day: event.target.value })} /></label>
          <button className="primary" disabled={state.busy}>{t("Save correction")}</button>
          <button type="button" className="secondary-button" onClick={() => setEdit(undefined)}>{t("Cancel")}</button>
        </form>}
      </li>;
    })}</ul>}
    <ShowMore hidden={(entries?.length ?? 0) - limit} onMore={() => setLimit(current => current + PAGE)} />
  </section>;
}
