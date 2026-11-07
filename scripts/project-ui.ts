import assert from 'node:assert/strict';
import { exerciseProjectBoard } from './project-board-ui.ts';
import { exercisePlanUI } from './plan-ui.ts';
import type { Page } from 'playwright-core';
import type { ProjectView, TicketStatus } from '../src/shared/projects.ts';
import { openTicket, closeTicket, setTicketStatus, exerciseProjectEdits } from './project-edit-ui.ts';

export const PROJECT_SMOKE_TITLE = 'Plan \u9879\u76ee <img src=x onerror=alert(1)>';

export async function exerciseProjectUI(page: Page, actionScreenshot?: string, editScreenshot?: string): Promise<ProjectView> {
  await page.getByRole('navigation', { name: 'Workspaces', exact: true })
    .getByRole('button', { name: 'Projects', exact: true }).click();
  await page.route('**/api/projects', route => route.request().method() === 'GET'
    ? route.fulfill({ status: 500, json: { error: 'Could not load projects.' } }) : route.continue());
  await page.getByRole('button', { name: 'New project', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'Could not load projects.' }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Retry', exact: true }).isEnabled(), true);
  assert.equal(await page.getByRole('button', { name: 'Action center', exact: true }).isEnabled(), true);
  await page.unroute('**/api/projects');
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
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
  for (const value of ['in_progress', 'review', 'backlog', 'done'] as TicketStatus[]) {
    await setTicketStatus(page, PROJECT_SMOKE_TITLE, value);
  }
  const ticketDialog = await openTicket(page, PROJECT_SMOKE_TITLE);
  await ticketDialog.getByRole('button', { name: 'Set prerequisites for ' + PROJECT_SMOKE_TITLE, exact: true }).click();
  const emptyChoices = ticketDialog.getByRole('form', { name: 'Prerequisites for ' + PROJECT_SMOKE_TITLE, exact: true });
  await emptyChoices.getByText('Add another ticket in this project to choose a prerequisite.', { exact: true }).waitFor();
  assert.equal(await emptyChoices.getByRole('button', { name: 'Save prerequisites', exact: true }).isDisabled(), true);
  const cancelChoices = emptyChoices.getByRole('button', { name: 'Cancel', exact: true });
  if (editScreenshot) await ticketDialog.screenshot({ path: editScreenshot.replace('.png', '-prerequisites-empty.png') });
  await cancelChoices.click();
  const beforeFailedStatus = await page.evaluate(async () => (await fetch('/api/projects')).json()) as ProjectView;
  await page.route('**/api/project-tickets/*/status', route => route.fulfill({ status: 500,
    json: { error: 'Could not change ticket status.' } }));
  await ticketDialog.getByRole('button', { name: 'Backlog', exact: true }).click();
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
  await addEntity('milestone', 'Preparation');
  await addTicket('Prepare input');
  await setTicketStatus(page, 'Prepare input', 'review');
  await addTicket('Check input');
  await setTicketStatus(page, 'Check input', 'done');
  await page.getByLabel('Milestone', { exact: true }).selectOption({ label: 'Separate goal' });
  let dependent = await openTicket(page, 'Separate project work');
  const prerequisites = dependent.getByRole('form', { name: 'Prerequisites for Separate project work', exact: true });
  const begin = () => dependent.getByRole('button', { name: 'Set prerequisites for Separate project work', exact: true }).click();
  const choice = () => prerequisites.getByRole('button', { name: 'Prepare input / Preparation', exact: true });
  const projectId = await page.evaluate(async () => {
    const view = await (await fetch('/api/projects')).json() as ProjectView;
    return view.projects.find(project => project.title === 'Another project')!.id;
  });
  const read = () => page.evaluate(async id => (await fetch('/api/projects?projectId=' + id)).json(), projectId) as Promise<ProjectView>;
  const beforeChoices = await read();
  await begin();
  assert.equal(await prerequisites.getByRole('button', { name: /Separate project work|Plan / }).count(), 0);
  assert.equal(await prerequisites.getByRole('checkbox').count(), 0);
  assert.equal(await prerequisites.getByRole('button', { name: 'Save prerequisites', exact: true }).isDisabled(), true);
  await choice().focus();
  await page.keyboard.press('Space');
  assert.equal(await choice().getAttribute('aria-pressed'), 'true');
  await page.keyboard.press('Enter');
  assert.equal(await choice().getAttribute('aria-pressed'), 'false');
  await choice().click();
  await page.keyboard.press('Escape');
  await dependent.waitFor();
  assert.equal(await dependent.getByRole('button', { name: 'Close Separate project work', exact: true }).isDisabled(), true);
  assert.equal(await dependent.getByRole('button', { name: 'Edit ticket Separate project work', exact: true }).isDisabled(), true);
  assert.equal(await page.getByLabel('Milestone', { exact: true }).isDisabled(), true);
  assert.equal(await page.getByRole('button', { name: 'Action center', exact: true, includeHidden: true }).isDisabled(), true);
  assert.equal(await page.getByRole('navigation', { name: 'Workspaces', exact: true, includeHidden: true })
    .getByRole('button', { name: 'Personal', exact: true, includeHidden: true }).isDisabled(), true);
  await prerequisites.getByRole('button', { name: 'Cancel', exact: true }).click();
  assert.deepEqual(await read(), beforeChoices);
  await begin();
  assert.equal(await choice().getAttribute('aria-pressed'), 'false');
  await choice().click();
  const otherChoice = prerequisites.getByRole('button', { name: 'Check input / Preparation', exact: true });
  await otherChoice.click();
  assert.equal(await choice().getAttribute('aria-pressed'), 'true');
  assert.equal(await otherChoice.getAttribute('aria-pressed'), 'true');
  await otherChoice.click();
  assert.equal(await otherChoice.getAttribute('aria-pressed'), 'false');
  if (editScreenshot) await dependent.screenshot({ path: editScreenshot.replace('.png', '-prerequisites.png') });
  await page.route('**/api/project-tickets/*/prerequisites', route => route.fulfill({
    status: 500, json: { error: 'Could not save prerequisite choices.' },
  }));
  await prerequisites.getByRole('button', { name: 'Save prerequisites', exact: true }).click();
  await dependent.getByRole('alert').filter({ hasText: 'Could not save prerequisite choices.' }).waitFor();
  assert.equal(await choice().getAttribute('aria-pressed'), 'true');
  assert.deepEqual(await read(), beforeChoices);
  await page.unroute('**/api/project-tickets/*/prerequisites');
  await prerequisites.getByRole('button', { name: 'Save prerequisites', exact: true }).click();
  await dependent.getByRole('status').filter({ hasText: 'Prerequisites saved.' }).waitFor();
  await dependent.getByText('Waiting for 1 prerequisite. This ticket cannot start yet.', { exact: true }).waitFor();
  assert.equal(await dependent.getByRole('button', { name: 'In Progress', exact: true }).isDisabled(), true);
  await closeTicket(page, 'Separate project work');
  await page.getByRole('button', { name: 'Action center', exact: true }).click();
  await page.getByRole('region', { name: 'Next task', exact: true }).getByText('No eligible Backlog task.', { exact: false }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Start ticket', exact: true }).count(), 0);
  await page.getByRole('navigation', { name: 'Project list', exact: true })
    .getByRole('button', { name: 'Another project', exact: true }).click();
  dependent = await openTicket(page, 'Separate project work');
  await dependent.getByRole('button', { name: 'Prepare input', exact: true }).click();
  const preparation = page.getByRole('dialog', { name: 'Prepare input', exact: true });
  await preparation.waitFor();
  assert.equal(await page.getByLabel('Milestone', { exact: true }).inputValue(), (await read()).milestones.find(m => m.title === 'Preparation')!.id);
  assert.equal(await page.getByRole('dialog').count(), 1);
  await preparation.getByRole('button', { name: 'Done', exact: true }).click();
  await preparation.getByRole('status').filter({ hasText: 'Ticket updated.' }).waitFor();
  await closeTicket(page, 'Prepare input');
  await page.getByLabel('Milestone', { exact: true }).selectOption({ label: 'Separate goal' });
  dependent = await openTicket(page, 'Separate project work');
  assert.equal(await dependent.getByRole('button', { name: 'In Progress', exact: true }).isEnabled(), true);
  await closeTicket(page, 'Separate project work');
  await page.getByRole('navigation', { name: 'Project list', exact: true })
    .getByRole('button', { name: 'Learning project', exact: true }).click();
  await page.getByLabel('Milestone', { exact: true }).selectOption({ label: 'First milestone' });
  await card.waitFor();
  assert.equal(await card.locator('.status-pill').innerText(), 'Done');
  assert.equal(await page.getByRole('button', { name: 'Open ticket Separate project work', exact: true }).count(), 0);
  assert.equal(await page.getByRole('button', { name: /Codex|GitHub/ }).count(), 0);
  await page.getByRole('navigation', { name: 'Project list', exact: true })
    .getByRole('button', { name: 'Another project', exact: true }).click();
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
  await exerciseProjectBoard(page);
  await exercisePlanUI(page);
  await exerciseCodingIntent(page);
  return await page.evaluate(async () => (await fetch('/api/projects')).json()) as ProjectView;
}

async function exerciseCodingIntent(page: Page) {
  await page.getByRole('button', { name: 'Milestones', exact: true }).click();
  await page.getByRole('button', { name: 'New ticket', exact: true }).click();
  await page.getByLabel('Ticket title', { exact: true }).fill('Unpublished coding example');
  await page.getByLabel('Work type', { exact: true }).selectOption('codex');
  await page.getByRole('button', { name: 'Add ticket', exact: true }).click();
  const draft = await openTicket(page, 'Unpublished coding example');
  await draft.getByText('Coding draft / Unpublished', { exact: true }).waitFor();
  assert.equal(await draft.getByRole('button', { name: 'Done', exact: true }).count(), 0);
  assert.equal(await draft.getByRole('button', { name: /Start/ }).count(), 0);
  await draft.getByRole('button', { name: 'Edit ticket Unpublished coding example', exact: true }).click();
  await draft.getByLabel('Work type', { exact: true }).selectOption('manual');
  await draft.getByRole('button', { name: 'Save changes', exact: true }).click();
  await draft.getByRole('button', { name: 'Done', exact: true }).waitFor();
  assert.equal(await draft.getByText('Coding draft / Unpublished', { exact: true }).count(), 0);
  await draft.getByRole('button', { name: 'Edit ticket Unpublished coding example', exact: true }).click();
  await draft.getByLabel('Work type', { exact: true }).selectOption('codex');
  await draft.getByRole('button', { name: 'Save changes', exact: true }).click();
  await draft.getByText('Coding draft / Unpublished', { exact: true }).waitFor();
  await closeTicket(page, 'Unpublished coding example');
}
