import { useState } from 'react';
import type { FormEvent } from 'react';
import { points } from '../../../src/shared/personal.ts';
import type { ActivityEntry, Reward, ScoringRule } from '../../../src/shared/personal.ts';
import type { Task } from '../../../src/shared/tasks.ts';
import type { PersonalController } from '../usePersonal.ts';

export function ScoringEditor({ task, rule, state }: { task: Task; rule?: ScoringRule; state: PersonalController }) {
  const [mode, setMode] = useState(rule?.mode ?? 'complete');
  const [rate, setRate] = useState(String((rule?.rate ?? 500) / 100));
  const [target, setTarget] = useState(rule?.target || 5);
  const [cue, setCue] = useState(rule?.cue ?? '');
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const success = await state.mutate('rule', { subject: task.id, mode, rate: Math.round(Number(rate) * 100), target, cue });
    if (success) document.getElementById('scoring-' + task.id)?.removeAttribute('open');
  }
  return <details className="scoring-editor" id={'scoring-' + task.id}>
    <summary>Points settings</summary>
    <form className="inline-settings" onSubmit={event => void save(event)}>
      {task.recurrenceId && <label>Record <select value={mode} onChange={event => {
        const value = event.target.value === 'minutes' ? 'minutes' : 'complete';
        setMode(value); setRate(value === 'minutes' ? '1' : '5');
      }}><option value="complete">Once per occurrence</option><option value="minutes">Minutes</option></select></label>}
      <label>{mode === 'minutes' ? 'Points per minute' : 'Points on completion'}
        <input type="number" min="0" max="1000" step=".01" required value={rate} onChange={event => setRate(event.target.value)} />
      </label>
      {mode === 'minutes' && <label>Target minutes
        <input type="number" min="1" max="1440" required value={target} onChange={event => setTarget(Number(event.target.value))} />
      </label>}
      <label>Habit cue <input value={cue} maxLength={180} onChange={event => setCue(event.target.value)} placeholder="After brushing my teeth..." /></label>
      <button className="primary" disabled={state.busy}>Save</button>
    </form>
  </details>;
}

export function HabitRow({ task, rule, state }: { task: Task; rule: ScoringRule; state: PersonalController }) {
  const [draft, setDraft] = useState<{ id: string; day: string; minutes: string }>();
  const total = state.data?.progress[task.id] ?? 0;
  const week = state.data?.week;
  const recent = week?.minutes[task.recurrenceId ?? task.id] ?? {};
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (draft && await state.mutate('log', { ...draft, subject: task.id, minutes: Number(draft.minutes) }, rule.target)) setDraft(undefined);
  }
  return <li className="habit-row">
    <div className="habit-header"><div><strong>{task.title}</strong><p>{total} / {rule.target} min
      {total >= rule.target ? ' - Target met' : total ? ' - Started' : ''} - {points(rule.rate)} pt/min</p>
      {rule.cue && <p>{rule.cue}</p>}</div>
      <button className="primary" disabled={state.busy || !state.data} onClick={() => setDraft({
        id: crypto.randomUUID(), day: state.data!.day, minutes: String(rule.target),
      })}>{total ? 'Log again' : 'Log minutes'}</button>
    </div>
    {week && <ul className="habit-week" aria-label="Last seven days against the current target">
      {week.days.map(day => {
        const minutes = recent[day] ?? 0;
        const status = minutes >= rule.target ? 'Target met' : minutes > 0 ? 'Started' : 'No log';
        return <li key={day} data-progress={status}>
          <time dateTime={day}>{new Intl.DateTimeFormat('en', { weekday: 'short', timeZone: 'UTC' })
            .format(new Date(day + 'T12:00:00Z'))}</time>
          <span>{status}</span><span>{minutes} min</span>
        </li>;
      })}
    </ul>}
    {draft && <form className="inline-settings" onSubmit={event => void save(event)}>
      <label>Minutes <input type="number" min="1" max="1440" value={draft.minutes} required autoFocus
        onChange={event => setDraft({ ...draft, minutes: event.target.value })} /></label>
      {[1, 5, 10].map(value => <button key={value} type="button" className="quiet-button"
        onClick={() => setDraft({ ...draft, minutes: String(value) })}>{value} min</button>)}
      {draft.day !== state.data?.day && <p role="alert">The date changed. Reopen this activity before saving.</p>}
      <button className="primary" disabled={state.busy || draft.day !== state.data?.day}>Save</button>
      <button type="button" className="quiet-button" onClick={() => setDraft(undefined)}>Cancel</button>
    </form>}
    <ScoringEditor task={task} rule={rule} state={state} />
  </li>;
}

export function PointsJar({ state, openRewards }: { state: PersonalController; openRewards: () => void }) {
  const data = state.data;
  if (!data) return null;
  const pinned = data.rewards.find(item => item.id === data.preferences.pinnedReward);
  const settled = Math.min(80, Math.ceil(Math.max(0, data.earned) * 0.008));
  const moving = Math.min(12, Math.ceil((state.reward?.points ?? 0) / 100));
  return <aside className="points-rail">
    <div className="points-label" aria-live="polite"><strong>{points(data.earned)}</strong> earned today</div>
    <div className={`points-jar ${data.preferences.reducedMotion ? 'still' : ''}`} aria-hidden="true">
      {Array.from({ length: settled }, (_, index) => <i key={index} className="settled-bead" />)}
      {state.reward && <div key={state.reward.id} className={`bead-fall ${state.reward.target ? 'target-hit' : ''}`}>
        {Array.from({ length: moving }, (_, index) => <i key={index} />)}
        <span>+{points(state.reward.points)}</span>
      </div>}
    </div>
    <strong>{points(data.balance)} available</strong>
    {pinned && <p>{pinned.title} - {data.balance >= pinned.cost ? 'Ready to redeem' : points(pinned.cost - data.balance) + ' points to go'}</p>}
    <button className="quiet-button" disabled={state.busy} onClick={openRewards}>Open rewards</button>
    <button className="quiet-button" disabled={state.busy}
      onClick={() => void state.mutate('preferences', { ...data.preferences, sound: !data.preferences.sound })}>
      {data.preferences.sound ? 'Mute sound' : 'Enable sound'}
    </button>
  </aside>;
}

function RewardForm({ initial, state, onClose }: { initial: Reward; state: PersonalController; onClose: () => void }) {
  const [draft, setDraft] = useState(initial);
  const [cost, setCost] = useState(String(initial.cost / 100));
  return <form className="inline-settings" onSubmit={async event => {
    event.preventDefault();
    if (await state.mutate('reward', { ...draft, cost: Math.round(Number(cost) * 100) })) onClose();
  }}>
    <label>Name <input required maxLength={160} value={draft.title} onChange={event => setDraft({ ...draft, title: event.target.value })} /></label>
    <label>Cost <input type="number" required min=".01" max="1000000" step=".01" value={cost} onChange={event => setCost(event.target.value)} /></label>
    <label>Note <input value={draft.note} maxLength={500} onChange={event => setDraft({ ...draft, note: event.target.value })} /></label>
    <label><input type="checkbox" checked={draft.onceOnly} onChange={event => setDraft({ ...draft, onceOnly: event.target.checked })} /> Redeem once</label>
    <button className="primary" disabled={state.busy}>Save reward</button>
    <button type="button" className="quiet-button" onClick={onClose}>Cancel</button>
  </form>;
}

export function RewardShop({ state }: { state: PersonalController }) {
  const [editing, setEditing] = useState<Reward>();
  const [redeeming, setRedeeming] = useState<{ item: Reward; id: string }>();
  const data = state.data;
  if (!data) return null;
  return <section className="rewards-shop">
    <p>{points(data.balance)} available</p>
    {editing ? <RewardForm key={editing.id} initial={editing} state={state} onClose={() => setEditing(undefined)} />
      : <button className="primary" onClick={() => setEditing({
        id: crypto.randomUUID(), title: '', cost: 3000, note: '', onceOnly: false, archived: false, used: false,
      })}>Add reward</button>}
    {data.rewards.map(item => <article className="reward-row" key={item.id}>
      <div><strong>{item.title}</strong><p>{points(item.cost)} points{item.note ? ' - ' + item.note : ''}</p></div>
      {redeeming?.item.id === item.id ? <div>
        <button className="primary" disabled={state.busy} onClick={async () => {
          if (await state.mutate('redeem', { id: redeeming.id, subject: item.id, cost: redeeming.item.cost })) setRedeeming(undefined);
        }}>Spend {points(redeeming.item.cost)} points</button>
        <button className="quiet-button" onClick={() => setRedeeming(undefined)}>Cancel</button>
      </div> : <div>
        <button className="primary" disabled={data.balance < item.cost || (item.onceOnly && item.used)}
          onClick={() => setRedeeming({ item, id: crypto.randomUUID() })}>
          {item.onceOnly && item.used ? 'Redeemed' : data.balance < item.cost ? points(item.cost - data.balance) + ' points to go' : 'Redeem'}
        </button>
        <button className="quiet-button" onClick={() => setEditing(item)}>Edit</button>
        <button className="quiet-button" onClick={() => void state.mutate('preferences', {
          ...data.preferences, pinnedReward: data.preferences.pinnedReward === item.id ? '' : item.id,
        })}>{data.preferences.pinnedReward === item.id ? 'Unpin' : 'Pin'}</button>
        <button className="quiet-button" onClick={() => void state.mutate('reward', { ...item, archived: true })}>Archive</button>
      </div>}
    </article>)}
    <details><summary>Feedback settings</summary><form className="inline-settings" onSubmit={event => {
      event.preventDefault();
      const values = new FormData(event.currentTarget);
      void state.mutate('preferences', { ...data.preferences, volume: Number(values.get('volume')),
        sound: values.has('sound'), reducedMotion: values.has('motion') });
    }}>
      <label>Volume <input name="volume" type="range" min="0" max="1" step=".05" defaultValue={data.preferences.volume} /></label>
      <label><input name="sound" type="checkbox" defaultChecked={data.preferences.sound} /> Sound</label>
      <label><input name="motion" type="checkbox" defaultChecked={data.preferences.reducedMotion} /> Reduce motion</label>
      <button className="primary" disabled={state.busy}>Save settings</button>
    </form></details>
    <ActivityHistory state={state} />
  </section>;
}

export function ActivityHistory({ state }: { state: PersonalController }) {
  const [edit, setEdit] = useState<{ entry: ActivityEntry; id: string; minutes: number; day: string }>();
  const entries = state.data?.entries ?? [];
  return <section className="activity-history"><h2>Points history</h2>
    {entries.length === 0 && <p>No points activity yet.</p>}
    {entries.map(entry => {
      const undone = entries.some(item => item.reference === entry.id && item.kind === 'reverse');
      const original = entry.kind === 'earn' || entry.kind === 'redeem';
      return <article key={entry.id} className="reward-row">
        <div><strong>{entry.title}</strong><p>{entry.day} - {entry.kind === 'reverse' ? 'Undone' : entry.kind === 'edit' ? 'Corrected' : entry.kind === 'redeem' ? 'Redeemed' : 'Earned'}
          {' - '}{entry.amount > 0 ? '+' : ''}{points(entry.amount)} points{entry.minutes ? ' - ' + entry.minutes + ' min' : ''}</p></div>
        {original && !undone && <div>
          {entry.minutes > 0 && <button className="quiet-button" onClick={() => setEdit({
            entry, id: crypto.randomUUID(), day: entry.day, minutes: entry.minutes + entries.filter(item => item.reference === entry.id).reduce((sum, item) => sum + item.minutes, 0),
          })}>Correct log</button>}
          <button className="quiet-button" disabled={state.busy} onClick={() => void state.mutate('reverse', { subject: entry.id, id: crypto.randomUUID() })}>Undo</button>
        </div>}
        {edit?.entry.id === entry.id && <form className="inline-settings" onSubmit={async event => {
          event.preventDefault();
          if (await state.mutate('edit', { subject: entry.id, id: edit.id, day: edit.day, minutes: edit.minutes })) setEdit(undefined);
        }}><label>Minutes <input type="number" min="1" max="1440" required value={edit.minutes}
          onChange={event => setEdit({ ...edit, minutes: Number(event.target.value) })} /></label>
          <label>Activity date <input type="date" required value={edit.day} max={state.data?.day}
            onChange={event => setEdit({ ...edit, day: event.target.value })} /></label>
          <button className="primary" disabled={state.busy}>Save correction</button>
          <button type="button" className="quiet-button" onClick={() => setEdit(undefined)}>Cancel</button>
        </form>}
      </article>;
    })}
  </section>;
}
