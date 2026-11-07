import assert from 'node:assert/strict';
import type { Page } from 'playwright-core';
import type { PlanDraft, PlanState } from '../src/shared/plans.ts';

/** UI replies are simulated; persistence is checked separately against real SQLite/HTTP. */
export async function exercisePlanUI(page: Page): Promise<void> {
  const before = await page.evaluate(async () => (await fetch('/api/projects')).json()) as { projects: { id: string }[] };
  const id = (await page.getByRole('button', { name: 'AI plan draft', exact: true }).getAttribute('id'))!.slice('plan-draft-'.length);
  await page.getByRole('button', { name: 'AI plan draft', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'AI plan draft', exact: true });
  const generate = dialog.getByRole('button', { name: 'Generate draft', exact: true });
  const goal = dialog.getByRole('textbox', { name: 'Project goal', exact: true });
  const consent = dialog.getByRole('checkbox', { name: 'I understand that generating this draft uses Codex allowance.', exact: true });
  await dialog.getByRole('status').filter({ hasText: 'Draft suggestions are private.' }).waitFor();
  await goal.fill('A small private goal'); assert.equal(await generate.isDisabled(), true);
  await consent.check(); await generate.click();
  await dialog.getByRole('status').filter({ hasText: 'Install the pinned runtime' }).waitFor();
  assert.equal(await consent.isChecked(), false); assert.equal(await generate.isDisabled(), true);
  assert.equal(await dialog.getByRole('region', { name: 'Saved AI draft' }).count(), 0);
  await dialog.getByRole('button', { name: 'Close AI plan draft', exact: true }).click();

  let state: PlanState = { draft: null, busy: false, cancelling: false, message: 'Simulated saved draft check.' };
  let generations = 0, cancellations = 0, edits = 0, approvals = 0, failSave = true;
  const pattern = '**/api/projects/*/plan-draft**';
  await page.route(pattern, route => {
    const path = new URL(route.request().url()).pathname;
    const id = path.split('/')[3]!;
    if (path.endsWith('/generate')) {
      assert.deepEqual(route.request().postDataJSON(), { goal: 'A small private goal', confirmAllowance: true });
      generations++;
      state = { ...state, busy: true, message: 'Waiting for an AI draft.' };
    } else if (path.endsWith('/cancel')) {
      cancellations++; state = { ...state, busy: false, cancelling: false, message: 'Plan request cancelled. The previous draft is unchanged.' };
    } else if (path.endsWith('/edit')) {
      edits++;
      if (failSave) { failSave = false; return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Simulated failed draft save.' }) }); }
      const input = route.request().postDataJSON() as { plan: PlanDraft['plan']; selectedTicketKeys: string[] };
      state = { ...state, draft: { ...state.draft!, plan: input.plan, selectedTicketKeys: input.selectedTicketKeys,
        revision: '22222222-2222-4222-8222-222222222222' }, message: 'Draft changes saved locally.' };
    } else if (path.endsWith('/approve')) {
      approvals++; assert.equal(route.request().postDataJSON().confirm, true);
      assert.deepEqual(state.draft!.selectedTicketKeys, ['first', 'next']);
      state = { ...state, approval: { draftId: state.draft!.id, projectId: id, approvedAt: '2026-11-08T00:00:00Z',
        milestoneIds: ['33333333-3333-4333-8333-333333333333'],
        ticketIds: ['44444444-4444-4444-8444-444444444444', '55555555-5555-4555-8555-555555555555'],
        codingTicketIds: ['55555555-5555-4555-8555-555555555555'] }, message: 'Selected plan saved. Nothing started.' };
    }
    if (state.draft) assert.equal(state.draft.projectId, id);
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(state) });
  });
  try {
    await page.getByRole('button', { name: 'AI plan draft', exact: true }).click();
    await dialog.getByRole('status').filter({ hasText: 'Simulated saved draft check.' }).waitFor();
    assert.equal(generations, 0);
    await goal.fill('A small private goal'); await consent.check(); await generate.click();
    await dialog.getByRole('status').filter({ hasText: 'Waiting for an AI draft.' }).waitFor();
    assert.equal(await generate.isDisabled(), true); assert.equal(await goal.isDisabled(), true);
    const saved: PlanDraft = { id: '11111111-1111-4111-8111-111111111111', projectId: id,
      goal: 'A small private goal', createdAt: '2026-11-07T00:00:00Z', plan: { milestones: [{ key: 'goal', title: 'A suggested milestone', description: 'Simulated model response.', tickets: [
        { key: 'first', title: 'Prepare the input', description: 'Manual preparation', acceptanceCriteria: 'Input is ready.', executionMode: 'manual', prerequisiteKeys: [] },
        { key: 'next', title: 'Build <script>example</script>', description: 'Suggested coding only', acceptanceCriteria: 'The example works.', executionMode: 'codex', prerequisiteKeys: ['first'] },
      ] }] } };
    state = { draft: saved, busy: false, cancelling: false, message: 'Draft saved locally. Suggestions are not approved tasks.' };
    const region = dialog.getByRole('region', { name: 'Saved AI draft', exact: true });
    await region.getByRole('heading', { name: 'A suggested milestone', exact: true }).waitFor();
    await region.locator('summary').filter({ hasText: 'Build <script>example</script>' }).click();
    await region.getByText('Suggested: Coding work (unpublished)', { exact: true }).waitFor();
    await region.getByText('Needs: Prepare the input', { exact: true }).waitFor();
    assert.equal(await region.locator('script').count(), 0);
    assert.equal(await consent.isChecked(), false);
    await consent.check(); await generate.click();
    await dialog.getByRole('button', { name: 'Cancel generation', exact: true }).click();
    await dialog.getByRole('status').filter({ hasText: 'Plan request cancelled.' }).waitFor();
    await region.getByRole('heading', { name: 'A suggested milestone', exact: true }).waitFor();
    await dialog.getByRole('button', { name: 'Close AI plan draft', exact: true }).click();
    await page.getByRole('button', { name: 'AI plan draft', exact: true }).click();
    await region.getByRole('heading', { name: 'A suggested milestone', exact: true }).waitFor();
    assert.equal(generations, 2); assert.equal(cancellations, 1);
    await consent.check(); await generate.click();
    await dialog.getByRole('button', { name: 'Cancel generation', exact: true }).waitFor();
    const cancelled = page.waitForResponse(response => response.url().endsWith('/plan-draft/cancel'));
    await page.keyboard.press('Escape'); await cancelled;
    await page.waitForFunction(() => document.querySelector('dialog[open]') === null);
    assert.equal(generations, 3); assert.equal(cancellations, 2);
    assert.deepEqual(await page.evaluate(async () => (await fetch('/api/projects')).json()), before);
    await page.getByRole('button', { name: 'AI plan draft', exact: true }).click();
    await dialog.getByRole('button', { name: 'Edit draft plan', exact: true }).click();
    const editor = dialog.getByRole('form', { name: 'Edit draft plan', exact: true });
    await editor.getByLabel('Task title', { exact: true }).first().fill('Revised preparation');
    await page.keyboard.press('Escape'); assert.equal(await dialog.isVisible(), true);
    assert.equal(await dialog.getByRole('button', { name: 'Close AI plan draft', exact: true }).isDisabled(), true);
    await editor.getByRole('button', { name: 'Save draft changes', exact: true }).click();
    await dialog.getByRole('alert').filter({ hasText: 'Simulated failed draft save.' }).waitFor();
    assert.equal(await editor.getByLabel('Task title', { exact: true }).first().inputValue(), 'Revised preparation');
    await editor.getByRole('button', { name: 'Save draft changes', exact: true }).click();
    await region.locator('summary').filter({ hasText: 'Revised preparation' }).waitFor();
    assert.equal(edits, 2);
    await dialog.getByRole('button', { name: 'Edit draft plan', exact: true }).click();
    await editor.getByLabel('Task title', { exact: true }).first().fill('Discard this title');
    await editor.getByRole('button', { name: 'Cancel draft changes', exact: true }).click();
    await region.locator('summary').filter({ hasText: 'Revised preparation' }).waitFor();
    await dialog.getByRole('button', { name: 'Preview selected plan', exact: true }).click();
    const preview = dialog.getByRole('region', { name: 'Plan approval preview', exact: true });
    await preview.getByText('Revised preparation', { exact: true }).waitFor();
    await preview.getByText('Needs: Revised preparation', { exact: true }).waitFor();
    assert.equal(await preview.getByRole('button', { name: 'Approve selected plan', exact: true }).isDisabled(), true);
    await preview.getByRole('checkbox').check();
    await preview.getByRole('button', { name: 'Approve selected plan', exact: true }).click();
    await dialog.getByRole('status').filter({ hasText: 'Plan approved: 2 saved tasks.' }).waitFor();
    assert.equal(approvals, 1); assert.equal(await dialog.getByRole('button', { name: 'Edit draft plan', exact: true }).count(), 0);
    await dialog.getByRole('button', { name: 'Close AI plan draft', exact: true }).click();
    await page.getByRole('button', { name: 'AI plan draft', exact: true }).click();
    await dialog.getByRole('status').filter({ hasText: 'Plan approved: 2 saved tasks.' }).waitFor();
    assert.equal(approvals, 1);
    await dialog.getByRole('button', { name: 'Close AI plan draft', exact: true }).click();
  } finally { await page.unroute(pattern); }
}
