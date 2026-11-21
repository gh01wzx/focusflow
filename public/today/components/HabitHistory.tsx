import { t } from '../../workspace/locale.ts';
import { useEffect, useState } from 'react';
import { addDays, localDay } from '../../../src/shared/calendar.ts';
import { readHabitHistory } from '../../../src/client/personal.ts';
import type { DayMark, HabitHistory as Habit, HabitHistoryView } from '../../../src/shared/history.ts';
import { dateText } from '../view-options.ts';
import { FoldCard } from './FoldCard.tsx';

const markText: Record<DayMark, string> = { goal: 'Goal met', maintain: 'Maintained', check: 'Checked in', low: 'Started',
  rest: 'Rest day', missed: 'Missed' };

// About half a year as a grid: a column per week from Monday, a square per day.
function Heatmap({ habit, from, today }: { habit: Habit; from: string; today: string }) {
  const first = addDays(from, -((new Date(from + 'T12:00:00Z').getUTCDay() + 6) % 7));
  const days: string[] = [];
  for (let day = first; day <= today; day = addDays(day, 1)) days.push(day);
  return <div className="heatmap" role="img" aria-label={t("{0}: the last six months", habit.title)}>
    {days.map(day => {
      const mark = day < from ? undefined : habit.days[day];
      return <i key={day} data-mark={mark ?? ''} title={dateText(day) + (mark ? ' · ' + t(markText[mark]) : '')} />;
    })}
  </div>;
}

// History's long view: each habit's last six months, and habits that graduated or stopped.
export function HabitHistory({ isFolded, toggle, reduced, busy, onResume }: {
  isFolded(key: string, initially?: boolean): boolean; toggle(key: string, initially?: boolean): void; reduced: boolean; busy: boolean;
  onResume(id: string, title: string): Promise<string>;
}) {
  const [view, setView] = useState<HabitHistoryView | null>(null);
  const [error, setError] = useState('');
  async function load() {
    try { setView(await readHabitHistory()); setError(''); } catch { setError('Could not read habit history.'); }
  }
  useEffect(() => { void load(); }, []);
  if (error) return <p className="error" role="alert">{t(error)}</p>;
  if (!view || !view.habits.length) return null;
  const active = view.habits.filter(habit => !habit.stoppedAt), stopped = view.habits.filter(habit => habit.stoppedAt);
  const legend = <p className="heatmap-legend" aria-hidden="true">{(['check', 'maintain', 'goal', 'low', 'rest', 'missed'] as const).map(mark =>
    <span key={mark}><i data-mark={mark} />{t(markText[mark])}</span>)}</p>;
  return <>
    {active.length > 0 && <FoldCard title={t("Habits over six months")} count={active.length} folded={isFolded('history:long')}
      reduced={reduced} onToggle={() => toggle('history:long')}>
      <ul className="heatmap-list">{active.map(habit => <li key={habit.id}>
        <strong>{habit.title}</strong><Heatmap habit={habit} from={view.from} today={view.today} />
      </li>)}</ul>
      {legend}
    </FoldCard>}
    {stopped.length > 0 && <FoldCard title={t("Graduated and stopped habits")} count={stopped.length} folded={isFolded('history:stopped', true)}
      reduced={reduced} onToggle={() => toggle('history:stopped', true)}>
      <ul className="heatmap-list">{stopped.map(habit => <li key={habit.id}>
        <div className="heatmap-heading"><strong>{habit.title}</strong>
          <span className="task-meta">{t("Stopped {0}", dateText(localDay(new Date(habit.stoppedAt!))))}</span>
          <button type="button" className="quiet-button" disabled={busy} onClick={async () => {
            if (!await onResume(habit.id, habit.title)) await load();
          }}>{t("Start again")}</button></div>
        <Heatmap habit={habit} from={view.from} today={view.today} />
      </li>)}</ul>
    </FoldCard>}
  </>;
}
