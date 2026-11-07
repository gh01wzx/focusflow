import assert from 'node:assert/strict';
import type { Page } from 'playwright-core';
import type { ProjectView, TicketStatus } from '../src/shared/projects.ts';
import { openTicket, closeTicket, setTicketStatus, exerciseProjectEdits } from './project-edit-ui.ts';

export const PROJECT_SMOKE_TITLE = 'Plan \u9879\u76ee <img src=x onerror=alert(1)>';

export async function exerciseProjectUI(page: Page, actionScreenshot?: string, editScreenshot?: string): Promise<ProjectView> {
  await page.getByRole('navigation', { name: 'Workspaces', exact: true })
    .getByRole('button', { name: 'Projects', exact: true }).click();
  await page.getByRole('button', { name: 'New project', exact: true }).click();
  await page.getByRole('dialog', { name: 'New project', exact: true }).waitFor();
  await page.getByLabel('Project title', { exact: true }).waitFor();

  async function addEntity(kind: 'project' | 'milestone', title: string) {
    const name = kind === 'project' ? 'Project' : 'Milestone';
    const input = page.getByLabel(name + ' title', { exact: true });
    if (!await input.isVisible()) await page.getByRole('button', { name: 'New ' + kind, exact: true }).click();
    await input.fill(title);
    await page.getByLabel(name + ' description', { exact: true }).fill('First line\nSecond line');
    await page.getByRole('button', { name: 'Add ' + kind, exact: true }).click();
    await page.getByRole('status').filter({ hasText: name + ' added.' }).waitFor();
  }
  async function addTicket(title: string) {
    const input = page.getByLabel('Ticket title', { exact: true });
    if (!await input.isVisible()) await page.getByRole('button', { name: 'New ticket', exact: true }).click();
    await input.fill(title);
    await page.getByLabel('Ticket description', { exact: true }).fill('Write a small plan.\nKeep the scope clear.');
    await page.getByLabel('Acceptance criteria', { exact: true }).fill('The plan has three clear steps.');
    await page.getByRole('button', { name: 'Add ticket', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'Ticket added.' }).waitFor();
    await page.getByRole('button', { name: 'Open ticket ' + title, exact: true }).waitFor();
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
  await addEntity('project', 'Learning project');
  await addEntity('milestone', 'First milestone');
  await addTicket(PROJECT_SMOKE_TITLE);
  const card = page.getByRole('button', { name: 'Open ticket ' + PROJECT_SMOKE_TITLE, exact: true });
  for (const value of ['ready', 'in_progress', 'review', 'blocked', 'backlog', 'done'] as TicketStatus[]) {
    await setTicketStatus(page, PROJECT_SMOKE_TITLE, value);
  }
  const ticketDialog = await openTicket(page, PROJECT_SMOKE_TITLE);
  const beforeFailedStatus = await page.evaluate(async () => (await fetch('/api/projects')).json()) as ProjectView;
  await page.route('**/api/project-tickets/*/status', route => route.fulfill({ status: 500,
    json: { error: 'Could not change ticket status.' } }));
  await ticketDialog.getByRole('button', { name: 'Blocked', exact: true }).click();
  await ticketDialog.getByRole('alert').filter({ hasText: 'Could not change ticket status.' }).waitFor();
  assert.equal(await ticketDialog.getByRole('button', { name: 'Done', exact: true }).getAttribute('aria-pressed'), 'true');
  assert.deepEqual(await page.evaluate(async () => (await fetch('/api/projects')).json()), beforeFailedStatus);
  await page.unroute('**/api/project-tickets/*/status');
  await page.getByText('The plan has three clear steps.', { exact: true }).waitFor();
  assert.equal(await page.locator('img').count(), 0);
  await closeTicket(page, PROJECT_SMOKE_TITLE);
  assert.equal(await page.locator('main').getByRole('button', { name: 'New project', exact: true }).count(), 0);
  assert.equal(await page.locator('.project-composer').count(), 0);
  await page.getByRole('button', { name: 'New ticket', exact: true }).click();
  const cancelledComposer = page.getByRole('dialog', { name: 'New ticket', exact: true });
  await cancelledComposer.getByLabel('Ticket title', { exact: true }).fill('Discard this draft');
  await cancelledComposer.getByRole('button', { name: 'Cancel', exact: true }).click();
  assert.deepEqual(await page.evaluate(async () => (await fetch('/api/projects')).json()), beforeFailedStatus);
  await addEntity('milestone', 'Second milestone');
  await addTicket('Second milestone work');
  await setTicketStatus(page, 'Second milestone work', 'in_progress');
  await addTicket('Check project plan');
  await setTicketStatus(page, 'Check project plan', 'review');
  assert.equal(await card.count(), 0);
  await addEntity('project', 'Another project');
  await addEntity('milestone', 'Separate goal');
  await addTicket('Separate project work');
  await page.getByRole('navigation', { name: 'Project list', exact: true })
    .getByRole('button', { name: 'Learning project', exact: true }).click();
  await page.getByLabel('Milestone', { exact: true }).selectOption({ label: 'First milestone' });
  await card.waitFor();
  assert.equal(await card.locator('.status-pill').innerText(), 'Done');
  assert.equal(await page.getByRole('button', { name: 'Open ticket Separate project work', exact: true }).count(), 0);
  assert.equal(await page.getByRole('button', { name: /Codex|GitHub/ }).count(), 0);
  await page.getByRole('navigation', { name: 'Project list', exact: true })
    .getByRole('button', { name: 'Another project', exact: true }).click();
  await setTicketStatus(page, 'Separate project work', 'ready');
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
  const activeCard = page.getByRole('button', { name: 'Open ticket Separate project work', exact: true });
  await activeCard.waitFor();
  assert.equal(await activeCard.locator('.status-pill').innerText(), 'In Progress');
  await page.getByRole('navigation', { name: 'Project views', exact: true })
    .getByRole('button', { name: 'Action center', exact: true }).click();
  await page.getByRole('navigation', { name: 'Project list', exact: true })
    .getByRole('button', { name: 'Learning project', exact: true }).click();
  await page.getByRole('heading', { name: 'Learning project', exact: true }).waitFor();
  await exerciseProjectEdits(page, PROJECT_SMOKE_TITLE, editScreenshot);
  return await page.evaluate(async () => (await fetch('/api/projects')).json()) as ProjectView;
}
