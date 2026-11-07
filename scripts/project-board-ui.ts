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
  const originalViewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
  try {
    for (const width of [1280, 1120]) {
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      const fits = await board.evaluate(element => {
        const columns = [...element.querySelectorAll('.status-column')].map(column => column.getBoundingClientRect());
        const bounds = element.getBoundingClientRect();
        return element.scrollWidth <= element.clientWidth + 2 && columns.every(column => column.left >= bounds.left - 1 && column.right <= bounds.right + 1);
      });
      assert.equal(fits, true, 'All four columns, including Done, must fit a normal window.');
      assert.equal(await page.getByRole('group', { name: 'Board columns', exact: true }).count(), 0);
    }
    await page.setViewportSize({ width: 800, height: 640 });
    const navigation = page.getByRole('group', { name: 'Board columns', exact: true });
    await navigation.waitFor();
    const next = navigation.getByRole('button', { name: 'Next columns', exact: true });
    for (let count = 0; count < 5 && await next.isEnabled(); count++) {
      await next.click();
      await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => resolve())));
    }
    assert.equal(await board.evaluate(element => {
      const done = element.querySelector('[data-status="done"]')!.getBoundingClientRect();
      const bounds = element.getBoundingClientRect(); return done.right <= bounds.right + 1 && done.left >= bounds.left - 1;
    }), true, 'Narrow windows must expose all of Done through top controls.');
    const previous = navigation.getByRole('button', { name: 'Previous columns', exact: true });
    for (let count = 0; count < 5 && await previous.isEnabled(); count++) {
      await previous.click();
      await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => resolve())));
    }
    assert.equal(await board.evaluate(element => element.scrollLeft <= 2), true);
  } finally { await page.setViewportSize(originalViewport); }
  const columns = await board.locator('.status-column').evaluateAll(elements => elements.map(element => {
    const rect = element.getBoundingClientRect();
    return { x: rect.x, y: rect.y, right: rect.right, border: parseFloat(getComputedStyle(element).borderLeftWidth) };
  }));
  assert.equal(columns.length, 4);
  assert.equal(await board.getByRole('region', { name: 'Ready', exact: true }).count(), 0);
  assert.equal(await board.getByRole('region', { name: 'Blocked', exact: true }).count(), 0);
  assert.ok(columns.every((column, index) => column.y === columns[0]!.y && column.border >= 1
    && (index === 0 || columns[index - 1]!.right < column.x)), 'Four distinct columns stay horizontal.');
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
  await dialog.getByRole('button', { name: 'Backlog', exact: true }).click();
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
  await page.getByRole('button', { name: 'Action center', exact: true }).click();
  await page.getByRole('region', { name: 'Review', exact: true }).getByRole('heading', { name: EDITED_TICKET, exact: true }).waitFor();
  assert.equal(await page.getByRole('region', { name: 'Project status board', exact: true }).count(), 0);
  await page.getByRole('navigation', { name: 'Project list', exact: true }).getByRole('button', { name: 'Another project', exact: true }).click();
  await page.getByRole('heading', { name: 'Another project', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Status board', exact: true }).click();
  await setTicketStatus(page, 'Prepare input', 'backlog');
  await setTicketStatus(page, 'Separate project work', 'backlog');
  const notice = board.getByRole('group', { name: 'Blockers for Separate project work', exact: true });
  await notice.getByText('Blocked', { exact: true }).waitFor();
  assert.equal(await board.getByRole('button', { name: 'Open ticket Separate project work', exact: true })
    .locator('button, a').count(), 0, 'Blocker links must be siblings of the card button.');
  await notice.getByRole('button', { name: 'Open prerequisite Prepare input', exact: true }).click();
  await page.getByRole('dialog', { name: 'Prepare input', exact: true }).waitFor();
  assert.equal(await page.getByRole('dialog').count(), 1);
  await closeTicket(page, 'Prepare input');
  await setTicketStatus(page, 'Prepare input', 'done');
  assert.equal(await notice.count(), 0);
  assert.equal(await board.getByRole('region', { name: 'Backlog', exact: true })
    .getByRole('button', { name: 'Open ticket Separate project work', exact: true }).count(), 1);
  await setTicketStatus(page, 'Separate project work', 'in_progress');
  const projectId = await page.evaluate(async () => {
    const first = await (await fetch('/api/projects')).json() as ProjectView;
    return first.projects.find(project => project.title === 'Another project')!.id;
  });
  const readCurrent = () => page.evaluate(async id => (await fetch('/api/projects?projectId=' + id)).json(), projectId) as Promise<ProjectView>;
  const beforeBlock = await readCurrent();
  dialog = await openTicket(page, 'Separate project work');
  await dialog.getByRole('button', { name: 'Add blocker', exact: true }).click();
  const form = dialog.getByRole('form', { name: 'Blocker for Separate project work', exact: true });
  const reason = form.getByRole('textbox', { name: 'What is stopping this ticket?', exact: true });
  await reason.fill('Discard this reason'); await form.getByRole('button', { name: 'Cancel', exact: true }).click();
  assert.deepEqual(await readCurrent(), beforeBlock);
  await dialog.getByRole('button', { name: 'Add blocker', exact: true }).click();
  const text = 'Waiting for feedback \u9879 <script>example</script>';
  await reason.fill(text);
  await page.route('**/api/project-tickets/*/blocker', route => route.fulfill({ status: 500, json: { error: 'Could not save this blocker.' } }));
  await form.getByRole('button', { name: 'Save blocker', exact: true }).click();
  await dialog.getByRole('alert').filter({ hasText: 'Could not save this blocker.' }).waitFor();
  assert.equal(await reason.inputValue(), text);
  assert.equal(await dialog.getByRole('button', { name: 'Close Separate project work', exact: true }).isDisabled(), true);
  assert.equal(await dialog.getByRole('button', { name: 'Done', exact: true }).isDisabled(), true);
  await page.unroute('**/api/project-tickets/*/blocker');
  await form.getByRole('button', { name: 'Save blocker', exact: true }).click();
  await dialog.getByRole('status').filter({ hasText: 'Blocker saved.' }).waitFor();
  await closeTicket(page, 'Separate project work');
  await notice.getByText(text, { exact: true }).waitFor();
  assert.equal(await notice.locator('script').count(), 0);
  assert.equal(await board.getByRole('region', { name: 'In Progress', exact: true })
    .getByRole('button', { name: 'Open ticket Separate project work', exact: true }).count(), 1);
  await page.getByRole('button', { name: 'Action center', exact: true }).click();
  const active = page.getByRole('region', { name: 'In progress', exact: true }).locator('.action-card')
    .filter({ has: page.getByRole('heading', { name: 'Separate project work', exact: true }) });
  await active.getByText(text, { exact: true }).waitFor();
  const linkedRead = '**/api/projects?projectId=*';
  await page.route(linkedRead, route => route.fulfill({ status: 500, json: { error: 'Could not load the linked ticket.' } }));
  await active.getByRole('button', { name: 'Inspect blocker', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'Could not load the linked ticket.' }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Action center', exact: true }).isEnabled(), true);
  await page.unroute(linkedRead); await page.getByRole('button', { name: 'Retry', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Separate project work', exact: true }); await dialog.waitFor();
  await dialog.getByRole('button', { name: 'Clear blocker', exact: true }).click();
  await dialog.getByRole('status').filter({ hasText: 'Blocker cleared.' }).waitFor();
  await closeTicket(page, 'Separate project work');
  const cleared = await readCurrent();
  assert.equal(cleared.tickets.find(ticket => ticket.title === 'Separate project work')!.status, 'in_progress');
  assert.equal(cleared.tickets.find(ticket => ticket.title === 'Separate project work')!.blockReason, '');
  await page.getByRole('navigation', { name: 'Project list', exact: true }).getByRole('button', { name: EDITED_PROJECT, exact: true }).click();
  await page.getByRole('heading', { name: EDITED_PROJECT, exact: true }).waitFor();
  await setTicketStatus(page, EDITED_TICKET, 'done');
  await page.getByRole('button', { name: 'Milestones', exact: true }).click();
  await page.getByLabel('Milestone', { exact: true }).waitFor();
}
