import assert from 'node:assert/strict';
import type { Page } from 'playwright-core';
import type { ProjectView } from '../src/shared/projects.ts';

export const EDITED_PROJECT = 'Learning project revised';
export const EDITED_TICKET = 'Revised \u9879\u76ee <img src=x onerror=alert(1)>';

export async function exerciseProjectEdits(page: Page, originalTitle: string, screenshot?: string) {
  const read = () => page.evaluate(async () => (await fetch('/api/projects')).json()) as Promise<ProjectView>;
  const before = await read();
  const original = before.tickets.find(ticket => ticket.title === originalTitle)!;
  assert.equal(original.status, 'done');
  await page.getByRole('button', { name: 'Edit project', exact: true }).click();
  const project = page.getByRole('form', { name: 'Edit project', exact: true });
  await project.getByLabel('Edit project title', { exact: true }).fill(EDITED_PROJECT);
  await project.getByLabel('Edit project description', { exact: true }).fill('New project details\n\u9879\u76ee');
  await project.getByRole('button', { name: 'Save changes', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Changes saved.' }).waitFor();
  await page.getByRole('navigation', { name: 'Project list', exact: true })
    .getByRole('button', { name: EDITED_PROJECT, exact: true }).waitFor();
  await page.getByRole('button', { name: 'Edit milestone', exact: true }).click();
  const milestone = page.getByRole('form', { name: 'Edit milestone', exact: true });
  await milestone.getByLabel('Edit milestone title', { exact: true }).fill('First milestone revised');
  await milestone.getByLabel('Edit milestone description', { exact: true }).fill('Updated goal\nKeep the same tickets.');
  await milestone.getByRole('button', { name: 'Save changes', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Changes saved.' }).waitFor();
  assert.equal(await page.getByLabel('Milestone', { exact: true }).inputValue(), original.milestoneId);
  const beforeTicketEdit = await read();
  const edit = () => page.getByRole('button', { name: 'Edit ticket ' + originalTitle, exact: true }).click();
  await edit();
  let form = page.getByRole('form', { name: 'Edit ticket', exact: true });
  await form.getByLabel('Edit ticket title', { exact: true }).fill('Cancelled change');
  await form.getByRole('button', { name: 'Cancel', exact: true }).click();
  assert.deepEqual(await read(), beforeTicketEdit);
  await edit();
  form = page.getByRole('form', { name: 'Edit ticket', exact: true });
  await form.getByLabel('Edit ticket title', { exact: true }).fill(' ');
  assert.equal(await form.getByRole('button', { name: 'Save changes', exact: true }).isDisabled(), true);
  await form.getByLabel('Edit ticket title', { exact: true }).fill(EDITED_TICKET);
  await form.getByLabel('Edit ticket description', { exact: true }).fill('Clarified work\n\u4fdd\u7559 <b>text</b>');
  await form.getByLabel('Edit ticket acceptance criteria', { exact: true }).fill('Check the revised result.\nKeep Done status.');
  await page.route('**/api/project-tickets/*/details', route => route.fulfill({
    status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Could not save local data. Try again.' }),
  }));
  await form.getByRole('button', { name: 'Save changes', exact: true }).click();
  await form.getByRole('alert').filter({ hasText: 'Could not save local data.' }).waitFor();
  assert.equal(await form.getByLabel('Edit ticket title', { exact: true }).inputValue(), EDITED_TICKET);
  assert.equal(await form.getByLabel('Edit ticket description', { exact: true }).inputValue(), 'Clarified work\n\u4fdd\u7559 <b>text</b>');
  assert.equal(await form.getByLabel('Edit ticket acceptance criteria', { exact: true }).inputValue(), 'Check the revised result.\nKeep Done status.');
  assert.deepEqual(await read(), beforeTicketEdit);
  assert.equal(await page.getByRole('navigation', { name: 'Workspaces', exact: true })
    .getByRole('button', { name: 'Personal', exact: true }).isDisabled(), true);
  const refreshed = page.waitForResponse(response => response.url().endsWith('/api/projects?projectId=' + before.selectedProjectId));
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await refreshed;
  assert.equal(await form.getByLabel('Edit ticket title', { exact: true }).inputValue(), EDITED_TICKET);
  await page.unroute('**/api/project-tickets/*/details');
  if (screenshot) await page.screenshot({ path: screenshot, fullPage: true });
  await form.getByRole('button', { name: 'Save changes', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Changes saved.' }).waitFor();
  await page.getByRole('heading', { name: EDITED_TICKET, exact: true }).waitFor();
  assert.equal(await page.getByLabel('Status for ' + EDITED_TICKET, { exact: true }).inputValue(), 'done');
  assert.equal(await page.locator('img').count(), 0);
  const after = (await read()).tickets.find(ticket => ticket.id === original.id)!;
  assert.equal(after.milestoneId, original.milestoneId);
  assert.equal(after.createdAt, original.createdAt);
  assert.equal(after.title, EDITED_TICKET);
  assert.equal(after.status, original.status);
  await page.getByRole('button', { name: 'Action center', exact: true }).click();
  await page.getByRole('region', { name: 'Review', exact: true }).getByText(EDITED_PROJECT + ' / Second milestone', { exact: true }).waitFor();
  await page.getByRole('navigation', { name: 'Project list', exact: true })
    .getByRole('button', { name: EDITED_PROJECT, exact: true }).click();
  await page.getByRole('heading', { name: EDITED_TICKET, exact: true }).waitFor();
}
