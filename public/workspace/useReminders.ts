import { t } from './locale.ts';
import { useEffect } from 'react';
import { readReminders, showReminder } from '../../src/client/reminders.ts';
import { EVENING_REMINDER, REMINDER_WINDOW_MINUTES } from '../../src/shared/reminders.ts';

// Reminders already shown today, kept in this browser so a restart does not repeat them.
const SENT_KEY = 'focusflow.reminded';
function readSent(day: string): Set<string> {
  try {
    const value = JSON.parse(localStorage.getItem(SENT_KEY) ?? 'null') as { day?: unknown; keys?: unknown } | null;
    return new Set(value?.day === day && Array.isArray(value.keys) ? value.keys.filter((key): key is string => typeof key === 'string') : []);
  } catch { return new Set(); }
}
function writeSent(day: string, keys: Set<string>) {
  try { localStorage.setItem(SENT_KEY, JSON.stringify({ day, keys: [...keys] })); } catch { /* Reminders may repeat after a restart. */ }
}
const minutesOf = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

// Once a minute, even while the window is hidden: a habit's planned time if it is not checked in,
// and at 8 PM one note for habits still open. Paused habits stay quiet.
export function useReminders() {
  useEffect(() => {
    let active = true, checking = false;
    async function check() {
      if (checking) return;
      checking = true;
      try {
        const due = await readReminders();
        if (!active || !due.enabled || due.paused) return;
        const now = new Date().toTimeString().slice(0, 5);
        const sent = readSent(due.today);
        for (const habit of due.habits) {
          const key = habit.id + '@' + habit.time;
          if (!habit.open || !habit.time || habit.time > now || sent.has(key)) continue;
          sent.add(key);
          writeSent(due.today, sent);
          if (minutesOf(now) - minutesOf(habit.time) > REMINDER_WINDOW_MINUTES) continue;
          await showReminder(t('Time for {0}', habit.title), habit.starter ? t('Start with: {0}', habit.starter) : t('Two minutes is enough to show up.'));
        }
        const open = due.habits.filter(habit => habit.open).length;
        if (now >= EVENING_REMINDER && open > 0 && !sent.has('evening')) {
          sent.add('evening');
          writeSent(due.today, sent);
          await showReminder(t('{0} habits still open today', open), t('A two-minute check-in keeps the chain. Close the day when you are ready.'));
        }
      } catch { /* The next check tries again. */ } finally { checking = false; }
    }
    void check();
    const timer = setInterval(() => void check(), 60_000);
    return () => { active = false; clearInterval(timer); };
  }, []);
}
