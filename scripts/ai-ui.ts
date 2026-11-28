import assert from 'node:assert/strict';
import type { Page } from 'playwright-core';

export async function exerciseAiUI(page: Page, screenshot?: string): Promise<void> {
  await exerciseSettings(page);
  await page.getByRole('button', { name: 'AI connection', exact: true }).click();
  const ai = page.getByRole('dialog', { name: 'AI connection', exact: true });
  await ai.getByRole('button', { name: 'ChatGPT sign-in', exact: true }).click();
  assert.equal(await ai.getByRole('button', { name: 'Run read-only AI check', exact: true }).isDisabled(), true);
  await ai.getByRole('button', { name: 'Check account', exact: true }).click();
  await ai.getByRole('status').filter({ hasText: 'Install the pinned official Codex runtime' }).waitFor();
  const simulated = { mode: 'chatgpt', runtimeVersion: '0.166.0', account: 'ui@example.invalid', plan: 'plus',
    message: 'Simulated UI account. No live model was used.', signInUrl: null, verified: false };
  await page.route('**/api/ai/check', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify(simulated),
  }));
  await ai.getByRole('button', { name: 'Check account', exact: true }).click();
  await ai.getByText('ui@example.invalid', { exact: true }).waitFor();
  assert.equal(await ai.getByRole('button', { name: 'Run read-only AI check', exact: true }).isDisabled(), true);
  await ai.getByRole('checkbox', { name: 'I understand that this read-only check uses Codex allowance.', exact: true }).check();
  let simulatedRequests = 0;
  await page.route('**/api/ai/verify', route => {
    assert.deepEqual(route.request().postDataJSON(), { confirmAllowance: true });
    simulatedRequests++;
    return route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ ...simulated, verified: true, message: 'Simulated UI response. No live model was used.' }) });
  });
  await ai.getByRole('button', { name: 'Run read-only AI check', exact: true }).click();
  await ai.getByRole('status').filter({ hasText: 'Simulated UI response.' }).waitFor();
  assert.equal(simulatedRequests, 1);
  assert.equal(await ai.getByRole('checkbox', { name: 'I understand that this read-only check uses Codex allowance.', exact: true }).isChecked(), false);
  assert.equal(await ai.getByRole('button', { name: 'Run read-only AI check', exact: true }).isDisabled(), true);
  if (screenshot) await page.screenshot({ path: screenshot, fullPage: true });
  await ai.getByRole('button', { name: 'Close', exact: true }).click();
  await page.unroute('**/api/ai/check');
  await page.unroute('**/api/ai/verify');
}

async function exerciseSettings(page: Page): Promise<void> {
  const entry = page.getByRole('button', { name: 'Settings', exact: true });
  await entry.click();
  const dialog = page.getByRole('dialog', { name: 'Settings', exact: true });
  await dialog.getByLabel('Language', { exact: true }).waitFor();
  await dialog.getByLabel('Startup workspace', { exact: true }).waitFor();
  await dialog.getByRole('button', { name: 'Close Settings', exact: true }).click();
  assert.equal(await entry.evaluate(element => element === document.activeElement), true);
}
