import { isHabit } from '../../../src/shared/tasks.ts';
import { t } from '../../workspace/locale.ts';
import { useEffect, useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import { motion } from 'motion/react';
import type { ScoringRule } from '../../../src/shared/personal.ts';
import type { Task } from '../../../src/shared/tasks.ts';
import { cueLine } from '../../../src/shared/habits.ts';
import { spring } from './Animated.tsx';
import { PlayIcon } from './Icons.tsx';
import type { Timer } from '../local-state.ts';

const START_SECONDS = 120;
const clock = (seconds: number) => Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');

interface NowProps {
  // Today's timed habits still below their target, in Next order.
  items: Task[];
  due: Task[];
  rules: Map<string, ScoringRule>;
  progress: Record<string, number>;
  busy: boolean;
  timer: Timer | null;
  onTimer(timer: Timer | null): void;
  // Each returns whether the save succeeded.
  onComplete(task: Task): Promise<boolean>;
  onLog(task: Task, amount: number): Promise<boolean>;
}

// A row of today's timed habits to swipe through. Two minutes is the way in: start, keep going
// as long as you like without interruption, and Stop adds the time to that habit.
export function NowCard(props: NowProps) {
  const { items, due, timer, onTimer } = props;
  // A timer can also start from Close the day, on a habit that is not timed.
  const timed = timer && due.find(task => task.id === timer.taskId);
  useEffect(() => {
    if (timer && !timed) onTimer(null);
  }, [timer, timed]);
  if (timed) return <RunningCard {...props} task={timed} timer={timer!} />;
  if (!items.length) return null;
  return <TimerCarousel {...props} />;
}

function TimerCarousel({ items, rules, progress, busy, onTimer }: NowProps) {
  const track = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; left: number } | null>(null);
  const [index, setIndex] = useState(0);
  const current = Math.min(index, items.length - 1);
  const minute = new Date().toTimeString().slice(0, 5);

  const go = (target: number) => {
    const element = track.current;
    if (!element) return;
    const next = Math.max(0, Math.min(items.length - 1, target));
    element.scrollTo({ left: next * element.clientWidth, behavior: 'smooth' });
  };
  // Mouse users drag the row; touch screens and trackpads swipe it natively.
  function down(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType !== 'mouse' || (event.target as HTMLElement).closest('button')) return;
    drag.current = { x: event.clientX, left: track.current!.scrollLeft };
    track.current!.classList.add('dragging');
    track.current!.setPointerCapture(event.pointerId);
  }
  function move(event: PointerEvent<HTMLDivElement>) {
    if (drag.current) track.current!.scrollLeft = drag.current.left - (event.clientX - drag.current.x);
  }
  function up() {
    const state = drag.current, element = track.current;
    if (!state || !element) return;
    drag.current = null;
    element.classList.remove('dragging');
    const width = element.clientWidth;
    const travelled = (element.scrollLeft - state.left) / width;
    // A short flick is enough to move one card.
    const start = Math.round(state.left / width);
    go(Math.abs(travelled) > 0.15 ? start + Math.sign(travelled) : start);
  }

  return <section className="now-carousel" aria-label={t('Habit timers')} aria-roledescription="carousel">
    <div className="now-track" ref={track} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
      onScroll={event => setIndex(Math.round(event.currentTarget.scrollLeft / Math.max(1, event.currentTarget.clientWidth)))}>
      {items.map((task, position) => {
        const rule = rules.get(task.recurrenceId ?? task.id);
        const cue = cueLine(rule);
        const later = rule?.time && rule.time > minute;
        const focusable = position === current ? 0 : -1;
        return <article key={task.id} className="now-card glass" aria-roledescription="slide"
          aria-label={t('{0} of {1}: {2}', position + 1, items.length, task.title)} aria-hidden={position !== current || undefined}>
          <div className="now-main">
            <p className="eyebrow">{later ? t('Next at ') + rule!.time : t('Next')}
              {rule ? ' · ' + t('{0} / {1} min', progress[task.id] ?? 0, rule.target) : ''}</p>
            <h2 className="now-title"><span className="sr-only">{t("Next:")} </span>{task.title}</h2>
            {cue && <p className="cue">{cue}</p>}
            {rule?.starter && <p className="starter">{t("Start with:")} {rule.starter}</p>}
            <div className="now-actions">
              <button className="primary now-start" disabled={busy} tabIndex={focusable}
                aria-label={t("Start two minutes on {0}", task.title)} onClick={() => onTimer({ taskId: task.id, startedAt: Date.now() })}>
                <PlayIcon />{t("Start 2 minutes")}</button>
            </div>
          </div>
        </article>;
      })}
    </div>
    {items.length > 1 && <div className="now-nav">
      <button type="button" className="icon-button" aria-label={t('Previous habit')} disabled={current === 0} onClick={() => go(current - 1)}>
        <svg className="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m15 6-6 6 6 6" /></svg></button>
      <span className="now-dots" aria-hidden="true">{items.map((task, position) =>
        <i key={task.id} className={position === current ? 'on' : ''} onClick={() => go(position)} />)}</span>
      <button type="button" className="icon-button" aria-label={t('Next habit')} disabled={current === items.length - 1} onClick={() => go(current + 1)}>
        <svg className="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg></button>
    </div>}
  </section>;
}

function RunningCard({ task, timer, rules, busy, onTimer, onComplete, onLog }: NowProps & { task: Task; timer: Timer }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { setNow(Date.now()); }, [timer.startedAt]);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const rule = rules.get(task.recurrenceId ?? task.id);
  const elapsed = Math.max(0, Math.floor((now - timer.startedAt) / 1000));
  const counted = rule?.mode === 'minutes' && rule.unit === 'count';
  const minutesHabit = rule?.mode === 'minutes' && !counted;
  // The ring fills over two minutes, or over the daily target. Time keeps counting after that.
  const goal = minutesHabit ? Math.max(START_SECONDS, rule.target * 60) : START_SECONDS;
  const loggedMinutes = Math.min(1440, Math.max(1, Math.round(elapsed / 60)));
  const cue = cueLine(rule);
  const cancel = () => onTimer(null);
  // Stop records the session: minutes for a timed habit, one count for a counted one, or done.
  async function stop() {
    const saved = counted ? await onLog(task, 1) : minutesHabit ? await onLog(task, loggedMinutes) : await onComplete(task);
    if (saved) cancel();
  }
  return <section className="now-card glass running" aria-label={t("Next")}>
    <div className="now-main">
      <p className="eyebrow">{t('In progress')}</p>
      <h2 className="now-title"><span className="sr-only">{t("Next:")} </span>{task.title}</h2>
      {cue && <p className="cue">{cue}</p>}
      {rule?.starter && <p className="starter">{t("Start with:")} {rule.starter}</p>}
      <div className="now-actions">
        <button className="primary" disabled={busy} aria-label={t("Stop and record {0}", task.title)} onClick={() => void stop()}>
          {counted ? t('Stop · log 1 count') : minutesHabit ? t("Stop · log {0} min", loggedMinutes)
            : t(isHabit(task) ? 'Stop · check in' : 'Stop · done')}</button>
        <button className="text-button" disabled={busy} onClick={cancel}>{t("Cancel timer")}</button>
      </div>
    </div>
    <div className="now-timer" role="timer" aria-label={t("Elapsed {0}", clock(elapsed))}>
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <circle className="track" cx="50" cy="50" r="42" />
        <motion.circle className="fill" cx="50" cy="50" r="42" initial={false}
          animate={{ pathLength: Math.min(1, elapsed / goal) }} transition={spring} />
      </svg>
      <strong>{clock(elapsed)}</strong>
      <span>{elapsed < START_SECONDS ? t('Just two minutes') : t('You showed up. Keep going as long as you like.')}</span>
    </div>
  </section>;
}
