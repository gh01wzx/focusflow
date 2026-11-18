import { isHabit } from '../../../src/shared/tasks.ts';
import { t } from '../../workspace/locale.ts';
import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import type { ScoringRule } from '../../../src/shared/personal.ts';
import type { Task } from '../../../src/shared/tasks.ts';
import { cueLine } from '../../../src/shared/habits.ts';
import { spring } from './Animated.tsx';
import { PlayIcon, SkipIcon, StarIcon } from './Icons.tsx';
import type { Timer } from '../local-state.ts';

const START_SECONDS = 120;
const clock = (seconds: number) => Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');

// One next action at a time. Starting is the two-minute rule: begin small, then keep going if you like.
export function NowCard({ candidates, due, rules, busy, sound, skipped, timer, focus, onTimer, onComplete, onLog, onSkip, onShowSkipped }: {
  candidates: Task[]; due: Task[]; rules: Map<string, ScoringRule>; busy: boolean; sound: { on: boolean; volume: number } | null;
  skipped: number; timer: Timer | null; focus: string[]; onTimer(timer: Timer | null): void;
  // Each returns whether the save succeeded.
  onComplete(task: Task): Promise<boolean>; onLog(task: Task, minutes: number): Promise<boolean>;
  onSkip(task: Task): void; onShowSkipped(): void;
}) {
  const [now, setNow] = useState(Date.now());
  const audio = useRef<AudioContext | null>(null);
  const chimed = useRef(false);
  // A running timer keeps its task on the card even if the order changes.
  const timed = timer && due.find(task => task.id === timer.taskId);
  const task = timed || candidates[0];
  const rule = task && rules.get(task.recurrenceId ?? task.id);
  const running = !!timed;
  const elapsed = running ? Math.max(0, Math.floor((now - timer!.startedAt) / 1000)) : 0;
  const counted = rule?.mode === 'minutes' && rule.unit === 'count';
  const minutesHabit = rule?.mode === 'minutes' && !counted;
  const goal = minutesHabit ? Math.max(START_SECONDS, rule.target * 60) : START_SECONDS;

  useEffect(() => {
    if (timer && !timed) onTimer(null);
  }, [timer, timed]);
  // A timer can start here or from the Close the day window. Either way the chime is prepared
  // right after the click, while the browser still allows sound.
  useEffect(() => {
    // A timer that passed two minutes while this card was hidden does not chime late.
    chimed.current = !!timer && Date.now() - timer.startedAt >= START_SECONDS * 1000;
    setNow(Date.now());
    if (!timer || !sound?.on) return;
    try {
      audio.current ??= new AudioContext();
      if (audio.current.state === 'suspended') void audio.current.resume().catch(() => {});
    } catch { /* Sound is optional. */ }
  }, [timer?.startedAt]);
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running]);
  useEffect(() => () => { void audio.current?.close().catch(() => {}); }, []);
  // A soft two-note chime when the first two minutes are done.
  useEffect(() => {
    if (!running || elapsed < START_SECONDS || chimed.current) return;
    chimed.current = true;
    const channel = audio.current;
    if (!channel || !sound?.on || channel.state !== 'running') return;
    for (const [index, hz] of [660, 990].entries()) {
      const oscillator = channel.createOscillator(), gain = channel.createGain();
      const start = channel.currentTime + index * 0.12;
      oscillator.frequency.value = hz;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.1 * sound.volume, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.4);
      oscillator.connect(gain); gain.connect(channel.destination);
      oscillator.start(start); oscillator.stop(start + 0.42);
    }
  }, [running, elapsed, sound]);

  if (!task) {
    return skipped > 0 ? <section className="now-card glass quiet" aria-label={t("Next")}>
      <p>{t("You set")} {skipped === 1 ? t('one thing') : skipped + t(' things')} {t("aside for now.")}</p>
      <button className="text-button" disabled={busy} onClick={onShowSkipped}>{t("Show again")}</button>
    </section> : null;
  }
  const doneLabel = counted ? t('Log 1 count') : t(isHabit(task) ? 'Check in' : 'Done');
  const cue = cueLine(rule);
  const later = !running && rule?.time && rule.time > new Date(now).toTimeString().slice(0, 5);
  function start() { onTimer({ taskId: task!.id, startedAt: Date.now() }); }
  function stop() { onTimer(null); }
  async function finish() {
    const saved = counted ? await onLog(task!, 1) : minutesHabit ? await onLog(task!, Math.min(1440, Math.max(1, Math.round(elapsed / 60))))
      : await onComplete(task!);
    if (saved) stop();
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
          <button className="primary" disabled={busy} aria-label={t("Finish {0}", task.title)} onClick={() => void finish()}>
            {counted ? t('Log 1 count') : minutesHabit ? t("Done · log {0} min", Math.max(1, Math.round(elapsed / 60))) : doneLabel}</button>
          <button className="secondary-button" disabled={busy} onClick={stop}>{t("Stop timer")}</button>
        </> : <>
          {!counted && <button className="primary now-start" disabled={busy} aria-label={t("Start two minutes on {0}", task.title)} onClick={start}>
            <PlayIcon />{t("Start 2 minutes")}</button>}
          {!minutesHabit && <button className="secondary-button" disabled={busy} aria-label={t(isHabit(task) ? 'Check in {0}' : 'Mark {0} done', task.title)}
            onClick={() => void (counted ? onLog(task, 1) : onComplete(task))}>{doneLabel}</button>}
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
      <span>{elapsed < START_SECONDS ? t('Just two minutes') : minutesHabit && elapsed < goal ? t('You showed up. Keep going?') : t('You showed up.')}</span>
    </div>}
  </section>;
}
