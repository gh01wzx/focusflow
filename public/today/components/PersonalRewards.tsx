import { useMemo, useState } from 'react';
import { points } from '../../../src/shared/personal.ts';
import type { ActivityEntry, Reward } from '../../../src/shared/personal.ts';
import type { PersonalController } from '../usePersonal.ts';

function RewardForm({ initial, state, onClose }: { initial: Reward; state: PersonalController; onClose: () => void }) {
  const [draft, setDraft] = useState(initial);
  const [cost, setCost] = useState(String(initial.cost / 100));
  return <form className="inline-settings reward-form glass" onSubmit={async event => {
    event.preventDefault();
    if (await state.mutate('reward', { ...draft, cost: Math.round(Number(cost) * 100) })) onClose();
  }}>
    <label>Name <input required maxLength={160} value={draft.title} autoFocus onChange={event => setDraft({ ...draft, title: event.target.value })} /></label>
    <label>Cost <input type="number" required min=".01" max="1000000" step=".01" value={cost} onChange={event => setCost(event.target.value)} /></label>
    <label>Note <input value={draft.note} maxLength={500} onChange={event => setDraft({ ...draft, note: event.target.value })} /></label>
    <label className="check-label"><input type="checkbox" checked={draft.onceOnly} onChange={event => setDraft({ ...draft, onceOnly: event.target.checked })} /> Redeem once</label>
    <button className="primary" disabled={state.busy}>Save reward</button>
    <button type="button" className="secondary-button" disabled={state.busy} onClick={onClose}>Cancel</button>
  </form>;
}

export function RewardShop({ state }: { state: PersonalController }) {
  const [editing, setEditing] = useState<Reward>();
  const [redeeming, setRedeeming] = useState<{ item: Reward; id: string }>();
  // Archived rewards leave the shop for good, so archiving takes a second click.
  const [archiving, setArchiving] = useState<string>();
  const data = state.data;
  if (!data) return <p className="feedback" role="status">{state.error ? '' : 'Loading rewards.'}</p>;
  return <section className="rewards-shop" aria-label="Rewards shop">
    <div className="rewards-heading glass">
      <p><strong>{points(data.balance)}</strong> points available</p>
      <p className="group-note">Choose rewards you genuinely look forward to. They make the habit worth repeating.</p>
      {!editing && <button className="primary" disabled={state.busy} onClick={() => setEditing({
        id: crypto.randomUUID(), title: '', cost: 3000, note: '', onceOnly: false, archived: false, used: false,
      })}>Add reward</button>}
    </div>
    {editing && <RewardForm key={editing.id} initial={editing} state={state} onClose={() => setEditing(undefined)} />}
    {data.rewards.length === 0 && !editing && <p className="list-note">Add a reward to work toward, such as a favorite meal or an hour of gaming.</p>}
    {data.rewards.length > 0 && <ul className="reward-list glass">{data.rewards.map(item => {
      const share = Math.min(1, Math.max(0, data.balance) / item.cost);
      return <li className="reward-row" key={item.id}>
        <div className="reward-info">
          <strong>{item.title}</strong>
          <p>{points(item.cost)} points{item.note ? ' · ' + item.note : ''}{data.preferences.pinnedReward === item.id ? ' · Pinned' : ''}</p>
          <span className="meter" aria-hidden="true"><span style={{ transform: `scaleX(${share})` }} /></span>
        </div>
        {redeeming?.item.id === item.id ? <div className="confirm-actions">
          <button className="primary" disabled={state.busy} onClick={async () => {
            if (await state.mutate('redeem', { id: redeeming.id, subject: item.id, cost: redeeming.item.cost })) setRedeeming(undefined);
          }}>Spend {points(redeeming.item.cost)} points</button>
          <button className="secondary-button" disabled={state.busy} onClick={() => setRedeeming(undefined)}>Cancel</button>
        </div> : archiving === item.id ? <div className="confirm-actions" role="group" aria-label={`Archive ${item.title}?`}>
          <span>Remove from the shop? History stays.</span>
          <button className="danger-button" disabled={state.busy} onClick={async () => {
            if (await state.mutate('reward', { ...item, archived: true })) setArchiving(undefined);
          }}>Archive</button>
          <button className="secondary-button" disabled={state.busy} onClick={() => setArchiving(undefined)}>Keep</button>
        </div> : <div className="reward-actions">
          <button className="primary" disabled={state.busy || data.balance < item.cost || (item.onceOnly && item.used)}
            onClick={() => setRedeeming({ item, id: crypto.randomUUID() })}>
            {item.onceOnly && item.used ? 'Redeemed' : data.balance < item.cost ? points(item.cost - data.balance) + ' points to go' : 'Redeem'}
          </button>
          <button className="quiet-button" disabled={state.busy} onClick={() => setEditing(item)}>Edit</button>
          <button className="quiet-button" disabled={state.busy} onClick={() => void state.mutate('preferences', {
            ...data.preferences, pinnedReward: data.preferences.pinnedReward === item.id ? '' : item.id,
          })}>{data.preferences.pinnedReward === item.id ? 'Unpin' : 'Pin'}</button>
          <button className="quiet-button" disabled={state.busy} aria-label={`Archive ${item.title}`}
            onClick={() => setArchiving(item.id)}>Archive</button>
        </div>}
      </li>;
    })}</ul>}
    <details className="feedback-settings glass"><summary>Feedback settings</summary><form className="inline-settings" onSubmit={event => {
      event.preventDefault();
      const values = new FormData(event.currentTarget);
      void state.mutate('preferences', { ...data.preferences, volume: Number(values.get('volume')),
        sound: values.has('sound'), reducedMotion: values.has('motion') });
    }}>
      <label>Volume <input name="volume" type="range" min="0" max="1" step=".05" defaultValue={data.preferences.volume} /></label>
      <label className="check-label"><input name="sound" type="checkbox" defaultChecked={data.preferences.sound} /> Sound</label>
      <label className="check-label"><input name="motion" type="checkbox" defaultChecked={data.preferences.reducedMotion} /> Reduce motion</label>
      <button className="primary" disabled={state.busy}>Save settings</button>
    </form></details>
    <ActivityHistory state={state} />
  </section>;
}

export function ActivityHistory({ state }: { state: PersonalController }) {
  const [edit, setEdit] = useState<{ entry: ActivityEntry; id: string; minutes: string; day: string }>();
  // Undo is permanent for that entry, so it takes a second click.
  const [undoing, setUndoing] = useState<string>();
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
  return <section className="activity-history"><h2>Points history</h2>
    {!entries?.length && <p className="list-note">No points activity yet.</p>}
    {!!entries?.length && <ul className="reward-list glass">{entries.map(entry => {
      const undone = adjustments.reversed.has(entry.id);
      const original = entry.kind === 'earn' || entry.kind === 'redeem';
      return <li key={entry.id} className="reward-row">
        <div className="reward-info"><strong>{entry.title}</strong><p>{[entry.day,
          entry.kind === 'reverse' ? 'Undone' : entry.kind === 'edit' ? 'Corrected' : entry.kind === 'redeem' ? 'Redeemed' : 'Earned',
          (entry.amount > 0 ? '+' : '') + points(entry.amount) + ' points', entry.minutes ? entry.minutes + ' min' : ''].filter(Boolean).join(' · ')}</p></div>
        {original && !undone && (undoing === entry.id ? <div className="confirm-actions" role="group" aria-label={`Undo ${entry.title}?`}>
          <span>{entry.kind === 'redeem' ? 'Refund these points?' : 'Remove these points?'}</span>
          <button className="danger-button" disabled={state.busy} onClick={async () => {
            if (await state.mutate('reverse', { subject: entry.id, id: crypto.randomUUID() })) setUndoing(undefined);
          }}>Undo</button>
          <button className="secondary-button" disabled={state.busy} onClick={() => setUndoing(undefined)}>Keep</button>
        </div> : <div className="reward-actions">
          {entry.minutes > 0 && <button className="quiet-button" disabled={state.busy} onClick={() => setEdit({
            entry, id: crypto.randomUUID(), day: entry.day, minutes: String(entry.minutes + (adjustments.minutes.get(entry.id) ?? 0)),
          })}>Correct log</button>}
          <button className="quiet-button" disabled={state.busy} onClick={() => setUndoing(entry.id)}>Undo</button>
        </div>)}
        {edit?.entry.id === entry.id && <form className="inline-settings" onSubmit={async event => {
          event.preventDefault();
          if (await state.mutate('edit', { subject: entry.id, id: edit.id, day: edit.day, minutes: Number(edit.minutes) })) setEdit(undefined);
        }}><label>Minutes <input type="number" min="1" max="1440" step="1" required value={edit.minutes}
          onChange={event => setEdit({ ...edit, minutes: event.target.value })} /></label>
          <label>Activity date <input type="date" required value={edit.day} max={state.data?.day}
            onChange={event => setEdit({ ...edit, day: event.target.value })} /></label>
          <button className="primary" disabled={state.busy}>Save correction</button>
          <button type="button" className="secondary-button" onClick={() => setEdit(undefined)}>Cancel</button>
        </form>}
      </li>;
    })}</ul>}
  </section>;
}
