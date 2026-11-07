import assert from 'node:assert/strict';
import type { Page } from 'playwright-core';

export async function exerciseGitHubUI(page: Page, projectTitle: string, screenshot?: string): Promise<void> {
  const sample = { available: true, connected: true, account: 'simulated-account' as string | null, clientId: 'Iv1.fixture',
    repository: null as { id: number; fullName: string; private: boolean } | null,
    preview: null as { id: number; fullName: string; private: boolean } | null,
    repositories: [{ id: 17, fullName: 'sample/public-work', private: false }],
    userCode: null, nextPollAt: 0, message: 'Simulated GitHub account for UI verification only.' };
  let confirmedRequests = 0;
  let failCheck = false;
  let delayRead = false;
  let readStarted!: () => void;
  let releaseRead!: () => void;
  const staleReadStarted = new Promise<void>(resolve => { readStarted = resolve; });
  const staleReadReleased = new Promise<void>(resolve => { releaseRead = resolve; });
  await page.route('**/api/projects/*/github**', async route => {
    const action = new URL(route.request().url()).pathname.split('/').at(-1);
    if (route.request().method() === 'GET' && delayRead) {
      const stale = structuredClone(sample);
      readStarted();
      await staleReadReleased;
      await route.fulfill({ json: stale });
      return;
    }
    if (action === 'check' && failCheck) {
      await route.fulfill({ status: 503, json: { error: 'Simulated connection failure.' } });
      return;
    }
    const body = route.request().method() === 'POST' ? route.request().postDataJSON() as Record<string, unknown> : {};
    if (action === 'inspect') { sample.preview = sample.repositories[0]!; sample.message = 'Review repository name and visibility.'; }
    if (action === 'connect') {
      assert.equal(body.confirmed, true); assert.equal(body.repositoryId, 17);
      confirmedRequests++; sample.repository = sample.preview; sample.preview = null;
      sample.message = 'Repository linked locally. No Issue, branch or pull request was created.';
    }
    if (action === 'disconnect') { sample.connected = false; sample.account = null; sample.repository = null; sample.message = 'Local access removed; task data unchanged.'; }
    await route.fulfill({ json: sample });
  });
  // Remount so the initial status uses the clearly simulated fixture.
  await page.getByRole('button', { name: 'Action center', exact: true }).click();
  await page.getByRole('navigation', { name: 'Project list', exact: true })
    .getByRole('button', { name: projectTitle, exact: true }).click();
  await page.getByText('GitHub connection', { exact: true }).click();
  await page.getByText('Simulated GitHub account for UI verification only.', { exact: true }).waitFor();
  assert.equal(await page.locator('.github-settings').getAttribute('open'), null);
  await page.getByText('Connection settings', { exact: true }).click();
  await page.getByLabel('GitHub App client ID', { exact: true }).waitFor();
  await page.getByText('Connection settings', { exact: true }).click();
  if (screenshot) await page.locator('.github-connection').screenshot({ path: screenshot.replace('.png', '-choose.png') });
  await page.getByLabel('Repository owner/name', { exact: true }).fill('sample/public-work');
  await page.getByRole('button', { name: 'Inspect repository', exact: true }).click();
  await page.getByText('Public repository', { exact: false }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Connect repository', exact: true }).isDisabled(), true);
  assert.equal(confirmedRequests, 0);
  const confirmation = page.getByRole('button', { name: 'I confirm this repository for this project.', exact: true });
  assert.equal(await page.locator('.github-preview').getByRole('checkbox').count(), 0);
  await confirmation.focus();
  await page.keyboard.press('Space');
  assert.equal(await confirmation.getAttribute('aria-pressed'), 'true');
  await page.keyboard.press('Enter');
  assert.equal(await confirmation.getAttribute('aria-pressed'), 'false');
  assert.equal(await page.getByRole('button', { name: 'Connect repository', exact: true }).isDisabled(), true);
  await confirmation.click();
  await page.getByLabel('Repository owner/name', { exact: true }).fill('sample/another');
  assert.equal(await page.getByRole('button', { name: 'Connect repository', exact: true }).count(), 0);
  assert.equal(confirmedRequests, 0);
  await page.getByLabel('Repository owner/name', { exact: true }).fill('sample/public-work');
  await page.getByRole('button', { name: 'Inspect repository', exact: true }).click();
  await page.getByRole('button', { name: 'I confirm this repository for this project.', exact: true }).click();
  if (screenshot) await page.locator('.github-connection').screenshot({ path: screenshot.replace('.png', '-confirm.png') });
  await page.getByRole('button', { name: 'Connect repository', exact: true }).click();
  await page.getByText('Repository linked locally. No Issue, branch or pull request was created.', { exact: true }).waitFor();
  assert.equal(confirmedRequests, 1);
  if (screenshot) await page.locator('.github-connection').screenshot({ path: screenshot });
  failCheck = true;
  await page.getByRole('button', { name: 'Check account and repositories', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'Simulated connection failure.' }).waitFor();
  delayRead = true;
  await page.getByRole('button', { name: 'Retry connection', exact: true }).click();
  let readTimer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([staleReadStarted, new Promise<never>((_, reject) => {
      readTimer = setTimeout(() => reject(new Error('Delayed GitHub status request was not reached.')), 10000);
    })]);
    await page.getByRole('button', { name: 'Disconnect this profile', exact: true }).click();
    await page.getByText('Local access removed; task data unchanged.', { exact: true }).waitFor();
    const staleResponse = page.waitForResponse(response => response.request().method() === 'GET'
      && new URL(response.url()).pathname.endsWith('/github'));
    releaseRead();
    await (await staleResponse).finished();
  } finally { if (readTimer) clearTimeout(readTimer); releaseRead(); }
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await page.locator('.github-account-row').getByText('Account: Not connected', { exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Check account and repositories', exact: true }).count(), 0);
  await page.getByRole('heading', { name: projectTitle, exact: true }).waitFor();
  if (screenshot) await page.locator('.github-connection').screenshot({ path: screenshot.replace('.png', '-disconnected.png') });
  await page.unrouteAll({ behavior: 'wait' });
  await page.locator('.github-connection > summary').click();
}
