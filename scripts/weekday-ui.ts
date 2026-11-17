import assert from 'node:assert/strict';
import type { Page } from 'playwright-core';
import type { TaskView } from '../src/shared/tasks.ts';
import { firstSelectedDate } from '../src/shared/weekdays.ts';
import { fillTaskWindow } from './task-window-ui.ts';

export async function exerciseWeekdayUI(page: Page, today: string): Promise<TaskView> {
  await page.getByRole('navigation', { name: 'Workspaces', exact: true })
    .getByRole('button', { name: 'Personal', exact: true }).click();
  const window = await fillTaskWindow(page, 'Chores on chosen weekdays', { date: today, frequency: 'weekly' });
  const picker = window.getByRole('group', { name: 'Repeat on', exact: true });
  const add = window.getByRole('button', { name: 'Add task', exact: true });
  assert.equal(await add.isDisabled(), true, 'Weekly tasks require a day selection.');
  for (const name of ['Monday', 'Tuesday', 'Saturday']) await picker.getByRole('checkbox', { name, exact: true }).check();
  assert.equal(await add.isEnabled(), true);
  await page.route('**/api/recurrences', async route => {
    assert.deepEqual(route.request().postDataJSON().weekdays, [1, 2, 6]);
    await route.fulfill({ status: 500, contentType: 'application/json',
      body: JSON.stringify({ error: 'Could not save local data. Please try again.' }) });
  });
  try {
    await add.click();
    await window.getByRole('alert').filter({ hasText: 'Could not save local data.' }).waitFor();
    assert.equal(await window.getByLabel('Task title', { exact: true }).inputValue(), 'Chores on chosen weekdays');
    for (const name of ['Monday', 'Tuesday', 'Saturday']) assert.equal(await picker.getByRole('checkbox', { name, exact: true }).isChecked(), true);
    await page.screenshot({ path: 'artifacts/today/weekday-picker.png', fullPage: true });
  } finally { await page.unroute('**/api/recurrences'); }
  await add.click();
  await page.getByRole('status').filter({ hasText: 'Task added.' }).waitFor();
  const expected = firstSelectedDate(today, [1, 2, 6]);
  await page.getByRole('heading', { name: expected === today ? 'Today' : 'Upcoming', exact: true }).waitFor();
  await page.getByText('Chores on chosen weekdays', { exact: true }).waitFor();
  const view = await page.evaluate(async () => (await fetch('/api/tasks')).json()) as TaskView;
  const rule = view.recurrences.find(rule => rule.title === 'Chores on chosen weekdays')!;
  assert.deepEqual(rule.weekdays, [1, 2, 6]);
  assert.equal([...view.due, ...view.upcoming].find(task => task.recurrenceId === rule.id)?.plannedDate, expected);
  return view;
}
