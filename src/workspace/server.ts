import { matchAiRoute, dispatchAiRoute } from '../ai/routes.ts';
import { createAiService } from '../ai/service.ts';
import type { AiService } from '../ai/service.ts';
import { createPlanGenerator } from '../plans/generator.ts';
import { createPlanService, PlanInputError } from '../plans/service.ts';
import type { PlanGenerator } from '../plans/service.ts';
import { matchPlanRoute, dispatchPlanRoute } from '../plans/routes.ts';
import { createPublicationService, PublicationError } from '../publication/service.ts';
import { matchPublicationRoute, dispatchPublicationRoute } from '../publication/routes.ts';
import { createLinkedWorkService, LinkedWorkError } from '../sync/service.ts';
import { matchLinkedWorkRoute, dispatchLinkedWorkRoute } from '../sync/routes.ts';
import type { GitHubService } from '../github/service.ts';
import { matchGitHubRoute, dispatchGitHubRoute } from '../github/routes.ts';
import { matchProjectRoute, dispatchProjectRoute } from '../projects/routes.ts';
import { ProjectInputError, ProjectNotFoundError } from '../projects/validation.ts';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { listenLocal } from '../http/local-server.ts';
import type { LocalServer } from '../http/local-server.ts';
import { HttpError, readJson, secureRequest, sendJson } from '../http/request.ts';
import { openWorkspaceStore } from './store.ts';
import { matchTaskRoute, dispatchTaskRoute } from '../tasks/routes.ts';
import { TaskInputError } from '../tasks/validation.ts';

const assets = new Map([
  ['/', ['today/index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['today/app.js', 'text/javascript; charset=utf-8']],
  ['/style.css', ['today/style.css', 'text/css; charset=utf-8']],
  ['/projects.css', ['projects/style.css', 'text/css; charset=utf-8']],
]);
export type ShutdownStage = 'transport:begin' | 'transport:stopped' | 'ai:begin' | 'ai:end' | 'github:begin' | 'github:end'
  | 'plans:begin' | 'plans:end' | 'handlers:draining' | 'database:begin' | 'database:end' | 'workspace:closed';

export async function startWorkspaceServer(options: {
  dataDirectory: string; clock?: () => Date; sampleLabel?: string | null; github?: GitHubService; ai?: AiService; planGenerator?: PlanGenerator;
  onShutdown?: (stage: ShutdownStage) => void;
}): Promise<LocalServer> {
  const store = await openWorkspaceStore(join(options.dataDirectory, 'tracker.db'), options.clock, !!options.sampleLabel);
  const trace = (stage: ShutdownStage) => { options.onShutdown?.(stage); };
  const taskApi = { ...store.tasks, snapshot: store.snapshot };
  const ai = options.ai ?? createAiService({ installed: async () => false, run: async () => { throw new Error('No desktop runtime'); } });
  const plans = createPlanService(store.planDrafts, options.planGenerator ?? createPlanGenerator(ai), store.planApproval);
  const publications = createPublicationService(store.publications, store.projects, store.projectTransaction, options.github?.issues);
  const linkedWork = createLinkedWorkService(store.linkedWork, store.projectRepository, store.projectTransaction, options.github?.issues);
  const local = await listenLocal(async (request, response, origin) => {
    try {
      secureRequest(request, response, origin);
      const resource = request.url ?? '';
      const asset = assets.get(resource);
      if (request.method === 'GET' && asset) {
        const [name, type] = asset;
        let content = await readFile(new URL(`../../public/${name}`, import.meta.url), 'utf8');
        if (resource === '/') {
          const label = (options.sampleLabel ?? '').replace(/[&<>"']/g, character => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
          })[character]!);
          const notice = label ? `<div class="sample-notice" role="note"><strong>Sample data</strong> &middot; ${label}. Everyday tasks are separate.</div>` : '';
          content = content.replace('<!-- sample-data-notice -->', notice);
          if (label) content = content.replace('<title>FocusFlow</title>', `<title>FocusFlow - ${label} - Sample data</title>`);
        }
        response.writeHead(200, { 'Content-Type': type! });
        response.end(content);
        return;
      }
      const linkedWorkRoute = matchLinkedWorkRoute(request.method, resource);
      if (linkedWorkRoute) {
        const input = request.method === 'GET' ? undefined : await readJson(request, origin, 32768);
        sendJson(response, 200, await dispatchLinkedWorkRoute(linkedWorkRoute, input, linkedWork));
        return;
      }
      const publicationRoute = matchPublicationRoute(request.method, resource);
      if (publicationRoute) {
        store.projects.view(publicationRoute.projectId);
        const input = request.method === 'GET' ? undefined : await readJson(request, origin, 4096);
        sendJson(response, 200, await dispatchPublicationRoute(publicationRoute, input, publications));
        return;
      }
      const planRoute = matchPlanRoute(request.method, resource);
      if (planRoute) {
        store.projects.view(planRoute.projectId);
        const input = request.method === 'GET' ? undefined : await readJson(request, origin, 1048576);
        sendJson(response, 200, dispatchPlanRoute(planRoute, input, plans));
        return;
      }
      const aiRoute = matchAiRoute(request.method, resource);
      if (aiRoute) {
        const input = request.method === 'GET' ? undefined : await readJson(request, origin, 4096);
        sendJson(response, 200, await dispatchAiRoute(aiRoute, input, ai));
        return;
      }
      const githubRoute = matchGitHubRoute(request.method, resource);
      if (githubRoute) {
        store.projects.view(githubRoute.projectId);
        const input = request.method === 'GET' ? undefined : await readJson(request, origin);
        if (githubRoute.action === 'connect') {
          store.projects.assertRepositoryChange(githubRoute.projectId,
            input && typeof input === 'object' && 'repositoryId' in input ? input.repositoryId : undefined);
        }
        sendJson(response, 200, await dispatchGitHubRoute(githubRoute, input, options.github));
        return;
      }
      const route = matchTaskRoute(request.method, resource);
      const projectRoute = matchProjectRoute(request.method, resource);
      if (!route && !projectRoute) {
        sendJson(response, 404, { error: 'Not found' });
        return;
      }
      const input = request.method === 'GET' ? undefined : await readJson(request, origin, projectRoute ? 32768 : 4096);
      const result = route ? await dispatchTaskRoute(route, input, taskApi)
        : dispatchProjectRoute(projectRoute!, input, store.projects);
      sendJson(response, result.status, result.body);
    } catch (error) {
      if (response.headersSent) {
        response.end();
        return;
      }
      const known = error instanceof HttpError || error instanceof TaskInputError || error instanceof ProjectInputError || error instanceof ProjectNotFoundError || error instanceof PlanInputError || error instanceof PublicationError || error instanceof LinkedWorkError;
      const status = error instanceof HttpError ? error.status : error instanceof ProjectNotFoundError ? 404
        : error instanceof TaskInputError || error instanceof ProjectInputError || error instanceof PlanInputError || error instanceof PublicationError || error instanceof LinkedWorkError ? 400 : 500;
      sendJson(response, status, {
        error: known ? error.message : 'Could not save local data. Check disk space and try again.',
      });
    }
  }, () => { trace('database:begin'); store.close(); trace('database:end'); }, async () => {
    trace('transport:stopped');
    const results = await Promise.allSettled([
      (async () => { trace('plans:begin'); await plans.close(); trace('plans:end'); })(),
      publications.close(),
      (async () => { trace('ai:begin'); await ai.close(); trace('ai:end'); })(),
      (async () => { trace('github:begin'); await options.github?.close(); trace('github:end'); })(),
    ]);
    trace('handlers:draining');
    if (results.some(result => result.status === 'rejected')) throw new Error('OWNED_REQUEST_SHUTDOWN_FAILED');
  });
  let closing: Promise<void> | undefined;
  return { origin: local.origin, close() {
    return closing ??= (async () => {
      trace('transport:begin');
      await local.close();
      trace('workspace:closed');
    })();
  } };
}
