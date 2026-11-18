import { t } from '../../workspace/locale.ts';
import { AnimatePresence, motion } from 'motion/react';
import { points } from '../../../src/shared/personal.ts';
import type { Progress } from '../../../src/shared/habits.ts';
import type { PersonalController } from '../usePersonal.ts';
import { AnimatedNumber, spring } from './Animated.tsx';
import { MoonIcon, SparkIcon, StarIcon } from './Icons.tsx';

const ratio = (progress: Progress) => progress.total ? Math.min(1, progress.done / progress.total) : 0;
const narrowDay = (day: string) => new Intl.DateTimeFormat(document.documentElement.lang, { weekday: 'narrow', timeZone: 'UTC' }).format(new Date(day + 'T12:00:00Z'));
const longDay = (day: string) => new Intl.DateTimeFormat(document.documentElement.lang, { weekday: 'long', timeZone: 'UTC' }).format(new Date(day + 'T12:00:00Z'));

function ProgressRing({ category, progress }: { category: 'habits' | 'tasks'; progress: Progress }) {
  const label = t(category === 'habits' ? 'Habits' : 'Tasks');
  return <div className={'progress-category ' + category}>
    <svg className="rings" viewBox="0 0 64 64" aria-hidden="true">
      <g transform="rotate(-90 32 32)" className={'ring ' + category + (progress.total && progress.done >= progress.total ? ' closed' : '')}>
        <circle className="track" cx="32" cy="32" r="26" />
        <motion.circle className="fill" cx="32" cy="32" r="26" initial={false}
          animate={{ pathLength: ratio(progress), opacity: progress.done ? 1 : 0 }} transition={spring} />
      </g>
      <path className="ring-symbol" fill="none" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"
        d={category === 'tasks' ? 'M22 32l7 7 13-15' : 'M42 31a10 10 0 1 1-4-8 M42 20v9h-9'} />
    </svg>
    <div><span>{label}</span><strong>{progress.done}/{progress.total}</strong></div>
  </div>;
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
      <ProgressRing category="habits" progress={habits} />
      <ProgressRing category="tasks" progress={tasks} />
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
        <small>{data.balance >= pinned.cost ? t('Ready to redeem') : t('{0} points to go', points(pinned.cost - data.balance))}</small>
      </div>}
    </div>
    <div className="panel-actions">
      <button className="panel-action" disabled={state.busy} onClick={onCloseDay}><MoonIcon />{t("Close the day")}</button>
      <button className="panel-action" disabled={state.busy} onClick={onReview}><SparkIcon />{t("Weekly review")}</button>
      <button className="panel-action" disabled={state.busy} onClick={onOpenRewards}><StarIcon />{t("Open rewards")}</button>
    </div>
  </aside>;
}
