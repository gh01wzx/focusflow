import { t } from '../../workspace/locale.ts';
import { AnimatePresence, motion } from 'motion/react';
import { points } from '../../../src/shared/personal.ts';
import type { Progress } from '../../../src/shared/habits.ts';
import type { PersonalController } from '../usePersonal.ts';
import { AnimatedNumber, spring } from './Animated.tsx';

const ratio = (progress: Progress) => progress.total ? Math.min(1, progress.done / progress.total) : 0;
const narrowDay = (day: string) => new Intl.DateTimeFormat(document.documentElement.lang, { weekday: 'narrow', timeZone: 'UTC' }).format(new Date(day + 'T12:00:00Z'));
const longDay = (day: string) => new Intl.DateTimeFormat(document.documentElement.lang, { weekday: 'long', timeZone: 'UTC' }).format(new Date(day + 'T12:00:00Z'));

// Two rings close as today's habits and tasks get done, like an activity summary.
function Rings({ habits, tasks }: { habits: Progress; tasks: Progress }) {
  const rings = [
    { key: 'habits', radius: 46, progress: habits },
    { key: 'tasks', radius: 30, progress: tasks },
  ];
  return <svg className="rings" viewBox="0 0 120 120" role="img"
    aria-label={t("Habits {0} of {1} done. Tasks {2} of {3} done.", habits.done, habits.total, tasks.done, tasks.total)}>
    <defs>
      <linearGradient id="ring-habits" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ff375f" /><stop offset="1" stopColor="#ff8aa8" /></linearGradient>
      <linearGradient id="ring-tasks" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#28c76f" /><stop offset="1" stopColor="#8ee4a9" /></linearGradient>
    </defs>
    <g transform="rotate(-90 60 60)">
      {rings.map(ring => <g key={ring.key} className={`ring ${ring.key} ${ring.progress.total && ring.progress.done >= ring.progress.total ? 'closed' : ''}`}>
        <circle className="track" cx="60" cy="60" r={ring.radius} />
        <motion.circle className="fill" cx="60" cy="60" r={ring.radius} stroke={`url(#ring-${ring.key})`}
          initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: ratio(ring.progress), opacity: ring.progress.done ? 1 : 0 }}
          transition={spring} />
      </g>)}
    </g>
  </svg>;
}

export function ProgressPanel({ state, habits, tasks, onOpenRewards, onCloseDay, onReview }: {
  state: PersonalController; habits: Progress; tasks: Progress; onOpenRewards(): void; onCloseDay(): void; onReview(): void;
}) {
  const data = state.data;
  if (!data) return <aside className="progress-panel glass" aria-label={t("Today's progress")}><p className="feedback">{t("Loading points.")}</p></aside>;
  const pinned = data.rewards.find(item => item.id === data.preferences.pinnedReward);
  const highest = Math.max(1, ...data.week.days.map(day => data.week.points[day] ?? 0));
  const award = state.reward;
  return <aside className="progress-panel glass" aria-label={t("Today's progress")}>
    <div className="rings-row">
      <Rings habits={habits} tasks={tasks} />
      <dl className="ring-legend">
        <div className="habits"><dt>{t("Habits")}</dt><dd>{habits.done}/{habits.total}</dd></div>
        <div className="tasks"><dt>{t("Tasks")}</dt><dd>{tasks.done}/{tasks.total}</dd></div>
      </dl>
    </div>
    <div className="points-today">
      {/* The counting number is visual only; screen readers hear the exact total once. */}
      <p aria-live="polite"><strong aria-hidden="true"><AnimatedNumber value={data.earned} format={points} step={100} /></strong>
        <span className="sr-only">{points(data.earned)}</span> {t("points today")}</p>
      {/* A new award floats up once. Reopening the page shows it already faded, so it never replays. */}
      <AnimatePresence initial={false}>
        {award && <motion.span key={award.id} className={`award ${award.target ? 'target' : ''}`} aria-hidden="true"
          initial={{ opacity: 0, y: 6, scale: 0.9 }} animate={{ opacity: [0, 1, 1, 0], y: [6, -4, -8, -16], scale: [0.9, 1.08, 1, 1] }}
          transition={{ duration: 1.6, times: [0, 0.18, 0.7, 1] }}>+{points(award.points)}</motion.span>}
      </AnimatePresence>
    </div>
    <ol className="week-bars" aria-label={t("Points over the last seven days")}>
      {data.week.days.map(day => {
        const value = data.week.points[day] ?? 0;
        return <li key={day} className={day === data.day ? 'today' : ''}>
          <span className="bar"><motion.span initial={false} animate={{ scaleY: Math.max(0, value) / highest }} transition={spring} /></span>
          <span className="day" aria-hidden="true">{narrowDay(day)}</span>
          <span className="sr-only">{longDay(day)}: {points(value)} {t("points")}</span>
        </li>;
      })}
    </ol>
    <div className="balance">
      <p><strong>{points(data.balance)}</strong> {t("points available")}</p>
      {pinned && <div className="reward-progress">
        <span className="reward-name">{pinned.title}</span>
        <span className="meter"><motion.span initial={false} animate={{ scaleX: Math.min(1, Math.max(0, data.balance) / pinned.cost) }} transition={spring} /></span>
        <small>{data.balance >= pinned.cost ? t('Ready to redeem') : points(pinned.cost - data.balance) + t(' points to go')}</small>
      </div>}
    </div>
    <div className="panel-actions">
      <button className="quiet-button" disabled={state.busy} onClick={onCloseDay}>{t("Close the day")}</button>
      <button className="quiet-button" disabled={state.busy} onClick={onReview}>{t("Weekly review")}</button>
      <button className="quiet-button" disabled={state.busy} onClick={onOpenRewards}>{t("Open rewards")}</button>
      <button className="quiet-button" disabled={state.busy}
        onClick={() => void state.mutate('preferences', { ...data.preferences, sound: !data.preferences.sound })}>
        {data.preferences.sound ? t('Mute sound') : t('Enable sound')}
      </button>
    </div>
  </aside>;
}
