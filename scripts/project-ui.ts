import assert from 'node:assert/strict';
import type { Page } from 'playwright-core';
import type { ProjectView } from '../src/shared/projects.ts';

export const PROJECT_SMOKE_TITLE = 'Plan \u9879\u76ee <img src=x onerror=alert(1)>';

export async function exerciseProjectUI(page: Page, actionScreenshot?: string): Promise<ProjectView> {
  await page.getByRole('navigation', { name: 'Workspaces', exact: true })
    .getByRole('button', { name: 'Projects', exact: true }).click();
  await page.getByRole('button', { name: 'New project', exact: true }).click();
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
  await page.getByLabel('Status for Second milestone work', { exact: true }).selectOption('in_progress');
  await page.getByRole('status').filter({ hasText: 'Ticket updated.' }).waitFor();
  await addTicket('Check project plan');
  await page.getByLabel('Status for Check project plan', { exact: true }).selectOption('review');
  await page.getByRole('status').filter({ hasText: 'Ticket updated.' }).waitFor();
  assert.equal(await page.getByRole('heading', { name: PROJECT_SMOKE_TITLE, exact: true }).count(), 0);
  await addEntity('project', 'Another project');
  await addEntity('milestone', 'Separate goal');
  await addTicket('Separate project work');
  await addEntity('milestone', 'Preparation');
  await addTicket('Prepare input');
  await page.getByLabel('Milestone', { exact: true }).selectOption({ label: 'Separate goal' });
  await page.getByRole('button', { name: 'Set prerequisites for Separate project work', exact: true }).click();
  const prerequisites = page.getByRole('form', { name: 'Prerequisites for Separate project work', exact: true });
  await prerequisites.getByRole('checkbox', { name: 'Prepare input / Preparation', exact: true }).check();
  assert.equal(await page.getByLabel('Milestone', { exact: true }).isDisabled(), true);
  assert.equal(await page.getByRole('button', { name: 'Action center', exact: true }).isDisabled(), true);
  assert.equal(await page.getByRole('navigation', { name: 'Workspaces', exact: true })
    .getByRole('button', { name: 'Personal', exact: true }).isDisabled(), true);
  await prerequisites.getByRole('button', { name: 'Cancel', exact: true }).click();
  assert.equal(await page.getByLabel('Milestone', { exact: true }).isEnabled(), true);
  await page.getByRole('button', { name: 'Set prerequisites for Separate project work', exact: true }).click();
  assert.equal(await prerequisites.getByRole('checkbox', { name: 'Prepare input / Preparation', exact: true }).isChecked(), false);
  await prerequisites.getByRole('checkbox', { name: 'Prepare input / Preparation', exact: true }).check();
  await page.route('**/api/project-tickets/*/prerequisites', route => route.fulfill({
    status: 500, json: { error: 'Could not save prerequisite choices.' },
  }));
  await prerequisites.getByRole('button', { name: 'Save prerequisites', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'Could not save prerequisite choices.' }).waitFor();
  assert.equal(await prerequisites.getByRole('checkbox', { name: 'Prepare input / Preparation', exact: true }).isChecked(), true);
  assert.equal(await page.getByLabel('Milestone', { exact: true }).isDisabled(), true);
  await page.unroute('**/api/project-tickets/*/prerequisites');
  await prerequisites.getByRole('button', { name: 'Save prerequisites', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Prerequisites saved.' }).waitFor();
  await page.getByText('Waiting for 1 prerequisite. This ticket cannot start yet.', { exact: true }).waitFor();
  await page.getByLabel('Status for Separate project work', { exact: true }).selectOption('ready');
  await page.getByRole('status').filter({ hasText: 'Ticket updated.' }).waitFor();
  await page.getByRole('button', { name: 'Action center', exact: true }).click();
  await page.getByRole('region', { name: 'Next task', exact: true }).getByText('No eligible Ready task.', { exact: false }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Start ticket', exact: true }).count(), 0);
  await page.getByRole('navigation', { name: 'Project list', exact: true }).getByRole('button', { name: 'Another project', exact: true }).click();
  await page.getByRole('button', { name: 'Prepare input', exact: true }).click();
  await page.getByLabel('Status for Prepare input', { exact: true }).selectOption('done');
  await page.getByRole('status').filter({ hasText: 'Ticket updated.' }).waitFor();
  await page.getByLabel('Milestone', { exact: true }).selectOption({ label: 'Separate goal' });
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
  await page.getByRole('region', { name: 'Review', exact: true })
    .getByRole('heading', { name: 'Check project plan', exact: true }).waitFor();
  await page.getByRole('region', { name: 'In progress', exact: true })
    .getByRole('heading', { name: 'Second milestone work', exact: true }).waitFor();
  const columns = await page.locator('.action-column').evaluateAll(elements => elements.map(element => {
    const rect = element.getBoundingClientRect();
    return { x: rect.x, y: rect.y, right: rect.right, border: parseFloat(getComputedStyle(element).borderLeftWidth) };
  }));
  assert.equal(columns.length, 3);
  assert.ok(columns.every(column => column.y === columns[0]!.y && column.border >= 1));
  assert.ok(columns[0]!.right < columns[1]!.x && columns[1]!.right < columns[2]!.x, 'Statuses must be separate horizontal columns.');
  assert.equal(await page.getByRole('button', { name: 'Browse projects', exact: true }).count(), 0);
  if (actionScreenshot) await page.screenshot({ path: actionScreenshot, fullPage: true });
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
  await page.getByRole('navigation', { name: 'Project list', exact: true })
    .getByRole('button', { name: 'Another project', exact: true }).click();
  await page.getByLabel('Status for Separate project work', { exact: true }).waitFor();
  assert.equal(await page.getByLabel('Status for Separate project work', { exact: true }).inputValue(), 'in_progress');
  await page.getByRole('navigation', { name: 'Project views', exact: true })
    .getByRole('button', { name: 'Action center', exact: true }).click();
  await page.getByRole('navigation', { name: 'Project list', exact: true })
    .getByRole('button', { name: 'Learning project', exact: true }).click();
  await page.getByRole('heading', { name: 'Learning project', exact: true }).waitFor();
  return await page.evaluate(async () => (await fetch('/api/projects')).json()) as ProjectView;
}
