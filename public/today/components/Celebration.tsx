import { t } from '../../workspace/locale.ts';
import { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'motion/react';

export interface Moment {
  id: number;
  // Habits done today after this one, out of today's habits.
  done: number;
  total: number;
  // Earlier days in a row with every habit done.
  streak: number;
}

const ease = [0.22, 1, 0.36, 1] as const;
// Where the last click or tap happened, so a ripple starts from the habit just finished.
const pointer = { x: 0, y: 0, at: 0 };
if (typeof window !== 'undefined') {
  window.addEventListener('pointerdown', event => { pointer.x = event.clientX; pointer.y = event.clientY; pointer.at = Date.now(); }, true);
}

// A quiet acknowledgement that grows as the day fills: one hairline ripple for the first habit,
// more for each one after, a gentle note when one is left, and a closing ring when all are done.
// Effects stay short, never block the page, and turn static with reduced motion.
export function Celebration({ moment, reduced, sound, onEnd }: {
  moment: Moment | null; reduced: boolean; sound: { on: boolean; volume: number }; onEnd(): void;
}) {
  const audio = useRef<AudioContext | null>(null);
  const all = !!moment && moment.done >= moment.total;
  useEffect(() => {
    if (!moment) return;
    const timer = setTimeout(onEnd, all ? 3200 : 2000);
    if (all && sound.on) chord(audio, sound.volume);
    return () => clearTimeout(timer);
  }, [moment?.id]);
  useEffect(() => () => { void audio.current?.close().catch(() => {}); }, []);

  const recent = Date.now() - pointer.at < 4000;
  const origin = recent ? { x: pointer.x, y: pointer.y } : { x: window.innerWidth / 2, y: window.innerHeight / 3 };
  const rings = !moment || all || reduced ? 0 : moment.done === 1 ? 1 : moment.total - moment.done === 1 ? 3 : 2;
  const note = !moment ? '' : all ? '' : moment.done === 1 && moment.total > 1 ? t('A good start')
    : moment.total - moment.done === 1 ? t('One left') : t('Keep going');

  return <div className="celebrate" aria-live="polite">
    <AnimatePresence>
      {moment && Array.from({ length: rings }, (_, index) =>
        <motion.span key={moment.id + ':' + index} className="ripple" style={{ left: origin.x, top: origin.y }}
          initial={{ scale: 0.35, opacity: 0.6 }} animate={{ scale: 1 + index * 0.35, opacity: 0 }}
          transition={{ duration: 1.1, delay: index * 0.14, ease }} />)}

      {moment && !all && <motion.div key={'note' + moment.id} className="whisper glass"
        initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.45, ease }}>
        {moment.total <= 10 && <span className="whisper-dots" aria-hidden="true">{Array.from({ length: moment.total }, (_, index) =>
          <i key={index} className={index < moment.done ? 'on' : ''} />)}</span>}
        <span>{note}</span>
        <span className="whisper-count">{t('{0} of {1}', moment.done, moment.total)}</span>
      </motion.div>}

      {moment && all && <motion.div key={'all' + moment.id} className="finale" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        exit={{ opacity: 0 }} transition={{ duration: 0.6, ease }}>
        <motion.div className="finale-card glass" role="status" style={{ pointerEvents: 'auto' }} onClick={onEnd}
          initial={{ opacity: 0, scale: 0.97, y: 6 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ duration: 0.6, ease }}>
          <svg viewBox="0 0 80 80" aria-hidden="true">
            <defs><linearGradient id="finale-ring" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#8e8cf0" /><stop offset="1" stopColor="#5856d6" /></linearGradient></defs>
            <circle className="finale-track" cx="40" cy="40" r="32" />
            <motion.circle cx="40" cy="40" r="32" className="finale-fill" stroke="url(#finale-ring)" transform="rotate(-90 40 40)"
              initial={{ pathLength: reduced ? 1 : 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.1, delay: 0.15, ease }} />
            <motion.path d="m28 41 8 8 16-17" className="finale-check"
              initial={{ pathLength: reduced ? 1 : 0, opacity: reduced ? 1 : 0 }} animate={{ pathLength: 1, opacity: 1 }}
              transition={{ duration: 0.45, delay: 1.05, ease }} />
          </svg>
          <p className="finale-title">{t('Every habit done today')}</p>
          <p className="finale-sub">{moment.streak >= 1 ? t('{0} days in a row', moment.streak + 1) : t('A quiet win. See you tomorrow.')}</p>
        </motion.div>
      </motion.div>}
    </AnimatePresence>
  </div>;
}

// A soft rising chord, low and short, played only for the day's last habit.
function chord(audio: { current: AudioContext | null }, volume: number) {
  try {
    audio.current ??= new AudioContext();
    const channel = audio.current;
    if (channel.state === 'suspended') void channel.resume().catch(() => {});
    [523.25, 659.25, 783.99].forEach((hz, index) => {
      const oscillator = channel.createOscillator(), gain = channel.createGain();
      const start = channel.currentTime + 0.35 + index * 0.11;
      oscillator.type = 'sine'; oscillator.frequency.value = hz;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.07 * volume, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 1.3);
      oscillator.connect(gain); gain.connect(channel.destination);
      oscillator.start(start); oscillator.stop(start + 1.35);
    });
  } catch { /* Sound is optional. */ }
}
