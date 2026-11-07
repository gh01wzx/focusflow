import assert from 'node:assert/strict';
import type { Page } from 'playwright-core';
import { TICKET_STATUSES, TICKET_STATUS_LABELS } from '../src/shared/projects.ts';
import type { ProjectView } from '../src/shared/projects.ts';
import { EDITED_PROJECT, EDITED_TICKET, openTicket, closeTicket, setTicketStatus } from './project-edit-ui.ts';

export async function exerciseProjectBoard(page: Page): Promise<void> {
  const read = () => page.evaluate(async () => (await fetch('/api/projects')).json()) as Promise<ProjectView>;
  const before = await read();
  await page.getByRole('button', { name: 'Status board', exact: true }).click();
  const board = page.getByRole('region', { name: 'Project status board', exact: true });
  await board.waitFor();
  const columns = await board.locator('.status-column').evaluateAll(elements => elements.map(element => {
    const rect = element.getBoundingClientRect();
    return { x: rect.x, y: rect.y, right: rect.right, border: parseFloat(getComputedStyle(element).borderLeftWidth) };
  }));
  assert.equal(columns.length, 6);
  assert.ok(columns.every((column, index) => column.y === columns[0]!.y && column.border >= 1
    && (index === 0 || columns[index - 1]!.right < column.x)), 'Six distinct columns stay horizontal.');
  for (const status of TICKET_STATUSES) await board.getByRole('region', { name: TICKET_STATUS_LABELS[status], exact: true }).waitFor();
  assert.equal(await board.getByRole('button', { name: /^Open ticket / }).count(), before.tickets.length);
  for (const ticket of before.tickets) {
    const card = board.getByRole('button', { name: 'Open ticket ' + ticket.title, exact: true });
    assert.equal(await card.locator('.ticket-milestone').innerText(), before.milestones.find(item => item.id === ticket.milestoneId)!.title);
  }
  assert.equal(await board.getByRole('button', { name: /Codex|GitHub/ }).count(), 0);
  await page.route('**/api/project-tickets/*/status', route => route.fulfill({ status: 503,
    json: { error: 'Simulated board save failure.' } }));
  let dialog = await openTicket(page, EDITED_TICKET);
  await dialog.getByRole('button', { name: 'Ready', exact: true }).click();
  await dialog.getByRole('alert').filter({ hasText: 'Simulated board save failure.' }).waitFor();
  assert.equal(await board.getByRole('region', { name: 'Done', exact: true }).getByRole('button', { name: 'Open ticket ' + EDITED_TICKET, exact: true }).count(), 1);
  await closeTicket(page, EDITED_TICKET);
  await page.unroute('**/api/project-tickets/*/status');
  for (const status of TICKET_STATUSES.filter(status => status !== 'done')) {
    await setTicketStatus(page, EDITED_TICKET, status);
    assert.equal(await board.getByRole('region', { name: TICKET_STATUS_LABELS[status], exact: true })
      .getByRole('button', { name: 'Open ticket ' + EDITED_TICKET, exact: true }).count(), 1);
    assert.equal(await board.getByRole('button', { name: 'Open ticket ' + EDITED_TICKET, exact: true }).count(), 1);
  }
  await setTicketStatus(page, EDITED_TICKET, 'review');
  await page.getByRole('button', { name: 'Action center', exact: true }).click();
  await page.getByRole('region', { name: 'Review', exact: true }).getByRole('heading', { name: EDITED_TICKET, exact: true }).waitFor();
  assert.equal(await page.getByRole('region', { name: 'Project status board', exact: true }).count(), 0);
  await page.getByRole('navigation', { name: 'Project list', exact: true }).getByRole('button', { name: 'Another project', exact: true }).click();
  await page.getByRole('heading', { name: 'Another project', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Status board', exact: true }).click();
  await setTicketStatus(page, 'Prepare input', 'backlog');
  await setTicketStatus(page, 'Separate project work', 'ready');
  await board.getByRole('button', { name: 'Open ticket Separate project work', exact: true }).getByText('Waiting for 1 prerequisite.', { exact: true }).waitFor();
  dialog = await openTicket(page, 'Separate project work');
  assert.equal(await dialog.getByRole('button', { name: 'In Progress', exact: true }).isDisabled(), true);
  await dialog.getByRole('button', { name: 'Prepare input', exact: true }).click();
  await page.getByRole('dialog', { name: 'Prepare input', exact: true }).waitFor();
  assert.equal(await page.getByRole('dialog').count(), 1);
  await closeTicket(page, 'Prepare input');
  await setTicketStatus(page, 'Prepare input', 'done');
  await setTicketStatus(page, 'Separate project work', 'in_progress');
  await page.getByRole('navigation', { name: 'Project list', exact: true }).getByRole('button', { name: EDITED_PROJECT, exact: true }).click();
  await page.getByRole('heading', { name: EDITED_PROJECT, exact: true }).waitFor();
  await setTicketStatus(page, EDITED_TICKET, 'done');
  await page.getByRole('button', { name: 'Milestones', exact: true }).click();
  await page.getByLabel('Milestone', { exact: true }).waitFor();
}
