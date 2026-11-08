import assert from 'node:assert/strict';
import type { Page, Request } from 'playwright-core';
import type { ProjectView } from '../src/shared/projects.ts';
import type { TaskView } from '../src/shared/tasks.ts';
import { openTicket, closeTicket, setTicketStatus } from './project-edit-ui.ts';

export const MANUAL_PROOF_PROJECT = 'Complete a reading exercise';
const titles = ['Read the sample paragraph', 'Write a one-line summary', 'Review the summary'];
const personalTitle = 'Personal task stays separate';
const projectView = (page: Page) => page.evaluate(async () => (await fetch('/api/projects')).json()) as Promise<ProjectView>;
const personalView = (page: Page) => page.evaluate(async () => (await fetch('/api/tasks')).json()) as Promise<TaskView>;

export async function completeManualProject(page: Page): Promise<ProjectView> {
  let forbidden = 0;
  const observe = (request: Request) => {
    if (request.method() === 'POST' && /\/(?:plan-draft\/generate|publication\/publish|ai\/verify|github\/start)$/.test(new URL(request.url()).pathname)) forbidden++;
  };
  page.on('request', observe);
  try {
    await page.getByLabel('Task title', { exact: true }).fill(personalTitle);
    await page.getByRole('button', { name: 'Add task', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'Task added.' }).waitFor();
    const beforePersonal = (await personalView(page)).due;
    await page.getByRole('navigation', { name: 'Workspaces', exact: true }).getByRole('button', { name: 'Projects', exact: true }).click();
    await page.getByRole('button', { name: 'New project', exact: true }).click();
    await page.getByLabel('Project title', { exact: true }).fill(MANUAL_PROOF_PROJECT);
    await page.getByLabel('Project description', { exact: true }).fill('Read a paragraph, write a summary and review it without coding or external publication.');
    await page.getByRole('button', { name: 'Add project', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'Project added.' }).waitFor();
    async function milestone(title: string) {
      await page.getByRole('button', { name: 'New milestone', exact: true }).click();
      await page.getByLabel('Milestone title', { exact: true }).fill(title);
      await page.getByRole('button', { name: 'Add milestone', exact: true }).click();
      await page.getByRole('status').filter({ hasText: 'Milestone added.' }).waitFor();
    }
    async function ticket(title: string, description: string, acceptanceCriteria: string) {
      await page.getByRole('button', { name: 'New ticket', exact: true }).click();
      await page.getByLabel('Ticket title', { exact: true }).fill(title);
      await page.getByLabel('Ticket description', { exact: true }).fill(description);
      await page.getByLabel('Acceptance criteria', { exact: true }).fill(acceptanceCriteria);
      await page.getByRole('button', { name: 'Add ticket', exact: true }).click();
      await page.getByRole('status').filter({ hasText: 'Ticket added.' }).waitFor();
    }
    async function prerequisite(title: string, needed: string, milestone: string) {
      const dialog = await openTicket(page, title);
      await dialog.getByRole('button', { name: 'Set prerequisites for ' + title, exact: true }).click();
      const form = dialog.getByRole('form', { name: 'Prerequisites for ' + title, exact: true });
      await form.getByRole('button', { name: needed + ' / ' + milestone, exact: true }).click();
      await form.getByRole('button', { name: 'Save prerequisites', exact: true }).click();
      await dialog.getByRole('status').filter({ hasText: 'Prerequisites saved.' }).waitFor();
      assert.equal(await dialog.getByRole('button', { name: 'In Progress', exact: true }).isDisabled(), true);
      await closeTicket(page, title);
    }
    await milestone('Read');
    await ticket(titles[0]!, 'Sample paragraph: A short daily practice can turn a large goal into a small next action.', 'The main idea is identified before writing.');
    await milestone('Write and review');
    await ticket(titles[1]!, 'Summarize the sample paragraph in one sentence.', 'The sentence captures a small next action.');
    await prerequisite(titles[1]!, titles[0]!, 'Read');
    await ticket(titles[2]!, 'Compare the summary with the original paragraph.', 'The summary is clear and does not introduce a different claim.');
    await prerequisite(titles[2]!, titles[1]!, 'Write and review');
    for (const [index, title] of titles.entries()) {
      await page.getByRole('button', { name: 'Action center', exact: true }).click();
      const next = page.getByRole('region', { name: 'Next task', exact: true });
      await next.getByRole('heading', { name: title, exact: true }).waitFor();
      await next.getByRole('button', { name: 'Start ticket', exact: true }).click();
      await page.getByRole('region', { name: 'In progress', exact: true }).getByRole('heading', { name: title, exact: true }).waitFor();
      await page.getByRole('navigation', { name: 'Project list', exact: true }).getByRole('button', { name: MANUAL_PROOF_PROJECT, exact: true }).click();
      await page.getByLabel('Milestone', { exact: true }).selectOption({ label: index === 0 ? 'Read' : 'Write and review' });
      const dialog = await openTicket(page, title);
      assert.equal(await dialog.getByRole('button', { name: 'Compare linked work', exact: true }).count(), 0);
      assert.equal(await dialog.getByText(/Coding draft|Coding task/).count(), 0);
      if (index === 1) {
        await dialog.getByRole('button', { name: 'Edit ticket ' + title, exact: true }).click();
        await dialog.getByLabel('Edit ticket description', { exact: true }).fill('Summary: Daily practice makes the next step manageable.');
        await dialog.getByRole('button', { name: 'Save changes', exact: true }).click();
        await dialog.getByRole('status').filter({ hasText: 'Changes saved.' }).waitFor();
      }
      await closeTicket(page, title);
      await setTicketStatus(page, title, 'review');
      await page.getByRole('button', { name: 'Action center', exact: true }).click();
      await page.getByRole('region', { name: 'Review', exact: true }).getByRole('heading', { name: title, exact: true }).waitFor();
      assert.equal(await page.getByRole('region', { name: 'Next task', exact: true }).getByRole('button', { name: 'Start ticket', exact: true }).count(), 0);
      await page.getByRole('navigation', { name: 'Project list', exact: true }).getByRole('button', { name: MANUAL_PROOF_PROJECT, exact: true }).click();
      await page.getByLabel('Milestone', { exact: true }).selectOption({ label: index === 0 ? 'Read' : 'Write and review' });
      await setTicketStatus(page, title, 'done');
    }
    await page.getByRole('button', { name: 'Status board', exact: true }).click();
    for (const title of titles) assert.equal(await page.getByRole('button', { name: 'Open ticket ' + title, exact: true }).locator('.status-pill').innerText(), 'Done');
    const saved = await projectView(page);
    assert.equal(saved.milestones.length, 2); assert.equal(saved.tickets.length, 3); assert.equal(saved.dependencies.length, 2);
    assert.ok(saved.tickets.every(ticket => ticket.status === 'done' && ticket.executionMode === 'manual' && ticket.coding === undefined));
    assert.deepEqual((await personalView(page)).due, beforePersonal);
    assert.equal(forbidden, 0); return saved;
  } finally { page.off('request', observe); }
}

export async function verifyCompletedManualProject(page: Page, expected: ProjectView): Promise<void> {
  await page.getByText(personalTitle, { exact: true }).waitFor();
  await page.getByRole('navigation', { name: 'Workspaces', exact: true }).getByRole('button', { name: 'Projects', exact: true }).click();
  await page.getByRole('region', { name: 'Next task', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Start ticket', exact: true }).count(), 0);
  await page.getByRole('navigation', { name: 'Project list', exact: true }).getByRole('button', { name: MANUAL_PROOF_PROJECT, exact: true }).click();
  await page.getByRole('button', { name: 'Status board', exact: true }).click();
  for (const title of titles) assert.equal(await page.getByRole('button', { name: 'Open ticket ' + title, exact: true }).locator('.status-pill').innerText(), 'Done');
  assert.deepEqual(await projectView(page), expected);
}
