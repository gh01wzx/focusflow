import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { startWorkspaceServer } from '../src/workspace/server.ts';
import { exerciseProjectUI } from './project-ui.ts';
import { EDITED_PROJECT, EDITED_TICKET } from './project-edit-ui.ts';
import type { ProjectView } from '../src/shared/projects.ts';

const root = await mkdtemp(join(tmpdir(), 'focusflow-project-browser-'));
const artifacts = resolve('artifacts', 'project-browser');
await mkdir(artifacts, { recursive: true });
let server = await startWorkspaceServer({ dataDirectory: join(root, 'data') });
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
let stage = 'launch-browser';
try {
  browser = await chromium.launch({ headless: true, chromiumSandbox: true, timeout: 30000 });
  let context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  let page = await context.newPage();
  page.setDefaultTimeout(10000);
  await page.goto(server.origin, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: 'Today.', exact: true }).waitFor();
  stage = 'project-interactions';
  const saved = await exerciseProjectUI(page, join(artifacts, 'actions.png'), join(artifacts, 'ticket-edit.png'));
  await page.screenshot({ path: join(artifacts, 'project-cards.png'), fullPage: true });
  const readAll = () => page.evaluate(async () => {
    const first = await (await fetch('/api/projects')).json() as ProjectView;
    return await Promise.all(first.projects.map(async project =>
      await (await fetch('/api/projects?projectId=' + project.id)).json() as ProjectView));
  });
  const savedProjects = await readAll();
  assert.ok(savedProjects.some(view => view.dependencies.length > 0));
  stage = 'restart-server-and-browser-context';
  await context.close();
  await server.close();
  server = await startWorkspaceServer({ dataDirectory: join(root, 'data') });
  context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  page = await context.newPage();
  page.setDefaultTimeout(10000);
  await page.goto(server.origin, { waitUntil: 'domcontentloaded' });
  await page.getByRole('navigation', { name: 'Workspaces', exact: true })
    .getByRole('button', { name: 'Projects', exact: true }).click();
  await page.getByRole('navigation', { name: 'Project list', exact: true })
    .getByRole('button', { name: EDITED_PROJECT, exact: true }).click();
  const card = page.getByRole('button', { name: 'Open ticket ' + EDITED_TICKET, exact: true });
  await card.waitFor();
  assert.equal(await card.locator('.status-pill').innerText(), 'Done');
  const restored = await page.evaluate(async () => (await fetch('/api/projects')).json()) as ProjectView;
  assert.deepEqual(restored, saved);
  assert.deepEqual(await readAll(), savedProjects);
  await page.screenshot({ path: join(artifacts, 'after-restart.png'), fullPage: true });
  await writeFile(join(artifacts, 'report.json'), JSON.stringify({
    status: 'verified', commit: process.env.GITHUB_SHA ?? 'unknown',
    scope: 'Browser project UI, status buttons, error/cancel drafts, focus restoration, cross-milestone prerequisites and local server/browser-context restart with disposable data.',
    limits: 'Does not verify Electron launch, native window close or Windows installation.',
  }, null, 2));
  console.log('PROJECT_BROWSER_VERIFIED');
} catch (error) {
  await writeFile(join(artifacts, 'failure.json'), JSON.stringify({ stage,
    message: error instanceof Error ? error.message : 'Project browser check failed' }, null, 2));
  throw error;
} finally {
  if (browser) await browser.close();
  await server.close();
  assert.equal(dirname(resolve(root)), resolve(tmpdir()));
  assert.ok(basename(root).startsWith('focusflow-project-browser-'));
  await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
