import { parseReminderView } from '../shared/reminders.ts';

export async function readReminders() {
  const response = await fetch('/api/reminders', { cache: 'no-store' });
  if (!response.ok) throw new Error('Could not read reminders.');
  return parseReminderView(await response.json());
}

export async function showReminder(title: string, body: string) {
  await fetch('/api/reminders/show', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, body }) });
}
