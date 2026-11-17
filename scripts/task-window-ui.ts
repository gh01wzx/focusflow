import type { Locator, Page } from 'playwright-core';
import type { Frequency, Weekday } from '../src/shared/tasks.ts';
import { WEEKDAYS } from '../src/shared/weekdays.ts';

// Personal tasks are created in the New task window.
export async function waitForPersonalReady(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'New task', exact: true }).waitFor();
  await page.waitForFunction(() => document.querySelector<HTMLButtonElement>('.new-button')?.disabled === false);
}

// Opens the window and fills it without submitting, so callers can check a failed save in place.
export async function fillTaskWindow(page: Page, title: string,
  options: { date?: string; frequency?: 'none' | Frequency; weekdays?: Weekday[] } = {}): Promise<Locator> {
  await page.getByRole('button', { name: 'New task', exact: true }).click();
  const window = page.getByRole('dialog', { name: 'New task', exact: true });
  await window.waitFor();
  const frequency = options.frequency ?? 'none';
  await window.getByRole('radio', { name: frequency === 'none' ? 'One-off' : 'Repeating', exact: true }).check();
  await window.getByLabel('Task title', { exact: true }).fill(title);
  if (frequency !== 'none') await window.getByLabel('Repeat', { exact: true }).selectOption(frequency);
  if (options.date) await window.getByLabel('Planned date', { exact: true }).fill(options.date);
  if (frequency === 'weekly' && options.weekdays) {
    const picker = window.getByRole('group', { name: 'Repeat on', exact: true });
    for (const day of WEEKDAYS) {
      await picker.getByRole('checkbox', { name: day.name, exact: true }).setChecked(options.weekdays.includes(day.value));
    }
  }
  return window;
}

export async function addPersonalTask(page: Page, title: string,
  options: { date?: string; frequency?: 'none' | Frequency; weekdays?: Weekday[] } = {}): Promise<void> {
  const window = await fillTaskWindow(page, title, options);
  await window.getByRole('button', { name: 'Add task', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Task added.' }).waitFor();
}
