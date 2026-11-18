import { isHabit } from '../../../src/shared/tasks.ts';
import { t } from '../../workspace/locale.ts';
import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import type { ScoringRule } from '../../../src/shared/personal.ts';
import type { Task } from '../../../src/shared/tasks.ts';
import { cueLine } from '../../../src/shared/habits.ts';
import { spring } from './Animated.tsx';
import { PlayIcon, SkipIcon, StarIcon } from './Icons.tsx';
import type { Timer } from '../local-state.ts';

const START_SECONDS = 120;
const clock = (seconds: number) => Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');

// One next action at a time. The timer is an optional, low-cost way in: start with two minutes,
// keep going as long as you like without interruption, and Stop records the time on its own.
export function NowCard({ candidates, due, rules, busy, skipped, timer, focus, onTimer, onComplete, onLog, onSkip, onShowSkipped }: {
  candidates: Task[]; due: Task[]; rules: Map<string, ScoringRule>; busy: boolean;
  skipped: number; timer: Timer | null; focus: string[]; onTimer(timer: Timer | null): void;
  // Each returns whether the save succeeded.
  onComplete(task: Task): Promise<boolean>; onLog(task: Task, minutes: number): Promise<boolean>;
  onSkip(task: Task): void; onShowSkipped(): void;
}) {
  const [now, setNow] = useState(Date.now());
  // A running timer keeps its task on the card even if the order changes.
  const timed = timer && due.find(task => task.id === timer.taskId);
  const task = timed || candidates[0];
  const rule = task && rules.get(task.recurrenceId ?? task.id);
  const running = !!timed;
  const elapsed = running ? Math.max(0, Math.floor((now - timer!.startedAt) / 1000)) : 0;
  const counted = rule?.mode === 'minutes' && rule.unit === 'count';
  const minutesHabit = rule?.mode === 'minutes' && !counted;
  // The ring fills over two minutes, or over the daily target for a timed habit. Time keeps counting after that.
  const goal = minutesHabit ? Math.max(START_SECONDS, rule.target * 60) : START_SECONDS;
  const loggedMinutes = Math.min(1440, Math.max(1, Math.round(elapsed / 60)));

  useEffect(() => {
    if (timer && !timed) onTimer(null);
  }, [timer, timed]);
  // A timer can start here or from the Close the day window.
  useEffect(() => { setNow(Date.now()); }, [timer?.startedAt]);
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running]);

  if (!task) {
    return skipped > 0 ? <section className="now-card glass quiet" aria-label={t("Next")}>
      <p>{t(skipped === 1 ? "You set one thing aside for now." : "You set {0} things aside for now.", skipped)}</p>
      <button className="text-button" disabled={busy} onClick={onShowSkipped}>{t("Show again")}</button>
    </section> : null;
  }
  const doneLabel = counted ? t('Log 1 count') : t(isHabit(task) ? 'Check in' : 'Done');
  const cue = cueLine(rule);
  const later = !running && rule?.time && rule.time > new Date(now).toTimeString().slice(0, 5);
  function start() { onTimer({ taskId: task!.id, startedAt: Date.now() }); }
  function cancel() { onTimer(null); }
  // Stop records the session: minutes for a timed habit, one count for a counted one, or done.
  async function stop() {
    const saved = counted ? await onLog(task!, 1) : minutesHabit ? await onLog(task!, loggedMinutes) : await onComplete(task!);
    if (saved) cancel();
  }

  return <section className={`now-card glass ${running ? 'running' : ''}`} aria-label={t("Next")}>
    <div className="now-main">
      <p className="eyebrow">{focus.includes(task.id) && <span className="focus-mark"><StarIcon />{t("Focus")}</span>}
        {running ? t('In progress') : later ? t('Next at ') + rule!.time : t('Next')}
        {candidates.length > 1 && !running ? t(" · {0} more after this", candidates.length - 1) : ''}</p>
      <h2 className="now-title"><span className="sr-only">{t("Next:")} </span>{task.title}</h2>
      {cue && <p className="cue">{cue}</p>}
      {rule?.starter && <p className="starter">{t("Start with:")} {rule.starter}</p>}
      <div className="now-actions">
        {running ? <>
          <button className="primary" disabled={busy} aria-label={t("Stop and record {0}", task.title)} onClick={() => void stop()}>
            {counted ? t('Stop · log 1 count') : minutesHabit ? t("Stop · log {0} min", loggedMinutes) : t('Stop · done')}</button>
          <button className="text-button" disabled={busy} onClick={cancel}>{t("Cancel timer")}</button>
        </> : <>
          <button className="primary now-start" disabled={busy} aria-label={t("Start two minutes on {0}", task.title)} onClick={start}>
            <PlayIcon />{t("Start 2 minutes")}</button>
          {/* The timer is optional: record straight away without it. */}
          <button className="secondary-button" disabled={busy}
            aria-label={minutesHabit ? t('Log {0} min for {1}', rule.target, task.title) : t(isHabit(task) ? 'Check in {0}' : 'Mark {0} done', task.title)}
            onClick={() => void (counted ? onLog(task, 1) : minutesHabit ? onLog(task, rule.target) : onComplete(task))}>
            {minutesHabit ? t('Log {0} min', rule.target) : doneLabel}</button>
          <button className="text-button" disabled={busy} aria-label={t("Skip {0} for now", task.title)} onClick={() => onSkip(task)}>
            <SkipIcon />{t("Later")}</button>
        </>}
      </div>
    </div>
    {running && <div className="now-timer" role="timer" aria-label={t("Elapsed {0}", clock(elapsed))}>
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <circle className="track" cx="50" cy="50" r="42" />
        <motion.circle className="fill" cx="50" cy="50" r="42" initial={false}
          animate={{ pathLength: Math.min(1, elapsed / goal) }} transition={spring} />
      </svg>
      <strong>{clock(elapsed)}</strong>
      <span>{elapsed < START_SECONDS ? t('Just two minutes') : t('You showed up. Keep going as long as you like.')}</span>
    </div>}
  </section>;
}
