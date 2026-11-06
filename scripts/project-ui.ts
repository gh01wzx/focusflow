import assert from 'node:assert/strict';
import type { Page } from 'playwright-core';
import type { ProjectView } from '../src/shared/projects.ts';

export const PROJECT_SMOKE_TITLE = 'Plan \u9879\u76ee <img src=x onerror=alert(1)>';

export async function exerciseProjectUI(page: Page): Promise<ProjectView> {
  await page.getByRole('navigation', { name: 'Workspaces', exact: true })
    .getByRole('button', { name: 'Projects', exact: true }).click();
  await page.getByRole('button', { name: 'Browse projects', exact: true }).click();
  await page.getByRole('heading', { name: 'Projects.', exact: true }).waitFor();
  await page.getByLabel('Project title', { exact: true }).waitFor();

  async function addEntity(kind: 'project' | 'milestone', title: string) {
    const name = kind === 'project' ? 'Project' : 'Milestone';
    const input = page.getByLabel(name + ' title', { exact: true });
    if (!await input.isVisible()) await page.locator('summary').filter({ hasText: new RegExp('^New ' + kind + '$') }).click();
    await input.fill(title);
    await page.getByLabel(name + ' description', { exact: true }).fill('First line\nSecond line');
    await page.getByRole('button', { name: 'Add ' + kind, exact: true }).click();
    await page.getByRole('status').filter({ hasText: name + ' added.' }).waitFor();
  }
  async function addTicket(title: string) {
    const input = page.getByLabel('Ticket title', { exact: true });
    if (!await input.isVisible()) await page.locator('summary').filter({ hasText: /^New ticket$/ }).click();
    await input.fill(title);
    await page.getByLabel('Ticket description', { exact: true }).fill('Write a small plan.\nKeep the scope clear.');
    await page.getByLabel('Acceptance criteria', { exact: true }).fill('The plan has three clear steps.');
    await page.getByRole('button', { name: 'Add ticket', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'Ticket added.' }).waitFor();
    await page.getByRole('heading', { name: title, exact: true }).waitFor();
  }

  await page.route('**/api/projects', async route => {
    if (route.request().method() !== 'POST') return route.continue();
    await route.fulfill({ status: 500, contentType: 'application/json',
      body: JSON.stringify({ error: 'Could not save local data. Check disk space and try again.' }) });
  });
  await page.getByLabel('Project title', { exact: true }).fill('Learning project');
  await page.getByRole('button', { name: 'Add project', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'Could not save local data.' }).waitFor();
  assert.equal(await page.getByLabel('Project title', { exact: true }).inputValue(), 'Learning project');
  await page.unroute('**/api/projects');
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await page.getByRole('alert').waitFor({ state: 'hidden' });
  await addEntity('project', 'Learning project');
  await addEntity('milestone', 'First milestone');
  await addTicket(PROJECT_SMOKE_TITLE);
  const status = page.getByLabel('Status for ' + PROJECT_SMOKE_TITLE, { exact: true });
  for (const value of ['ready', 'in_progress', 'review', 'blocked', 'done']) {
    await status.selectOption(value);
    await page.getByRole('status').filter({ hasText: 'Ticket updated.' }).waitFor();
  }
  await page.locator('.ticket-acceptance summary').click();
  await page.getByText('The plan has three clear steps.', { exact: true }).waitFor();
  assert.equal(await page.locator('img').count(), 0);
  await addEntity('milestone', 'Second milestone');
  await addTicket('Second milestone work');
  assert.equal(await page.getByRole('heading', { name: PROJECT_SMOKE_TITLE, exact: true }).count(), 0);
  await addEntity('project', 'Another project');
  await addEntity('milestone', 'Separate goal');
  await addTicket('Separate project work');
  await page.getByRole('navigation', { name: 'Project list', exact: true })
    .getByRole('button', { name: 'Learning project', exact: true }).click();
  await page.getByLabel('Milestone', { exact: true }).selectOption({ label: 'First milestone' });
  await status.waitFor();
  assert.equal(await status.inputValue(), 'done');
  assert.equal(await page.getByRole('heading', { name: 'Separate project work', exact: true }).count(), 0);
  assert.equal(await page.getByRole('button', { name: /Codex|GitHub/ }).count(), 0);
  await page.getByRole('navigation', { name: 'Project list', exact: true })
    .getByRole('button', { name: 'Another project', exact: true }).click();
  await page.getByLabel('Status for Separate project work', { exact: true }).selectOption('ready');
  await page.getByRole('status').filter({ hasText: 'Ticket updated.' }).waitFor();
  await page.getByRole('button', { name: 'Action center', exact: true }).click();
  await page.getByRole('heading', { name: 'Action center.', exact: true }).waitFor();
  const next = page.getByRole('region', { name: 'Next task', exact: true });
  await next.getByRole('heading', { name: 'Separate project work', exact: true }).waitFor();
  await next.locator('summary').click();
  await next.getByText('The plan has three clear steps.', { exact: true }).waitFor();
  await page.route('**/api/project-tickets/*/start', route => route.fulfill({
    status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Could not start this ticket.' }),
  }));
  await next.getByRole('button', { name: 'Start ticket', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'Could not start this ticket.' }).waitFor();
  await next.getByRole('heading', { name: 'Separate project work', exact: true }).waitFor();
  await page.unroute('**/api/project-tickets/*/start');
  await next.getByRole('button', { name: 'Start ticket', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Ticket started.' }).waitFor();
  await page.getByRole('region', { name: 'In progress', exact: true })
    .getByRole('heading', { name: 'Separate project work', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Start ticket', exact: true }).count(), 0);
  await page.getByRole('button', { name: 'Browse projects', exact: true }).click();
  await page.getByRole('navigation', { name: 'Project list', exact: true })
    .getByRole('button', { name: 'Learning project', exact: true }).click();
  return await page.evaluate(async () => (await fetch('/api/projects')).json()) as ProjectView;
}
