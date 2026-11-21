// What a reminder check needs: today's open habits with their planned times, and whether reminders
// are on. The interface writes the text in the chosen language.
export interface ReminderHabit { id: string; title: string; time: string; starter: string; open: boolean }
export interface ReminderView { enabled: boolean; today: string; paused: boolean; habits: ReminderHabit[] }
// The evening nudge for habits not yet checked in.
export const EVENING_REMINDER = '20:00';
// A planned time older than this is left to the evening nudge, so opening the app late is quiet.
export const REMINDER_WINDOW_MINUTES = 180;

export function parseReminderView(value: unknown): ReminderView {
  const record = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  if (typeof record.enabled !== 'boolean' || typeof record.today !== 'string' || typeof record.paused !== 'boolean' || !Array.isArray(record.habits)) {
    throw new Error('Could not read reminders.');
  }
  return record as unknown as ReminderView;
}
