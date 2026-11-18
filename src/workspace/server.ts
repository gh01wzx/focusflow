import { isInterface } from '../shared/interface.ts';
import { createHash } from 'node:crypto';
import type { NamedApi } from '../shared/ai.ts';
import { parseAiModelSelection, supportsSelection } from '../shared/ai.ts';
import { unfinishedPrerequisites } from '../shared/dependencies.ts';
import { git } from '../execution/git.ts';
import { repositoryName } from '../shared/github.ts';
import type { RepositoryContext } from '../shared/project-settings.ts';
import { patchFiles } from '../execution/patch-turn.ts';
import { createPreviewService } from '../execution/preview.ts';
import { createTicketAi } from '../projects/ticket-ai.ts';
import { projectInstructions } from '../projects/settings.ts';
import { matchAiRoute, dispatchAiRoute } from '../ai/routes.ts';
import { createAiService } from '../ai/service.ts';
import { createAiProviders } from '../ai/providers.ts';
import type { AiService } from '../ai/service.ts';
import type { CompatibleService } from '../ai/compatible.ts';
import type { DshService } from '../ai/dsh.ts';
import { createPlanGenerator } from '../plans/generator.ts';
import { createPlanService, PlanInputError } from '../plans/service.ts';
import type { PlanGenerator } from '../plans/service.ts';
import { matchPlanRoute, dispatchPlanRoute } from '../plans/routes.ts';
import { createPublicationService, PublicationError } from '../publication/service.ts';
import { matchPublicationRoute, dispatchPublicationRoute } from '../publication/routes.ts';
import { createLinkedWorkService, LinkedWorkError } from '../sync/service.ts';
import { matchLinkedWorkRoute, dispatchLinkedWorkRoute } from '../sync/routes.ts';
import { readBuildInfo } from '../runtime/build-info.ts';
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
import { createWorkspaceService } from '../execution/workspaces.ts';
import { matchCodingRoute, dispatchWorkspaceRoute } from '../execution/routes.ts';
import { ExecutionFailure } from '../execution/git.ts';
import { createApprovalBroker } from '../execution/approvals.ts';
import { createCodingService } from '../execution/service.ts';
import {createDeliveryService} from '../execution/delivery.ts';
import {createReviewService} from '../execution/review.ts';

const assets = new Map([
  ['/', ['today/index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['today/app.js', 'text/javascript; charset=utf-8']],
  ['/style.css', ['today/style.css', 'text/css; charset=utf-8']],
  ['/projects.css', ['projects/style.css', 'text/css; charset=utf-8']],
  ['/fonts/inter-latin.woff2', ['today/fonts/inter-latin-wght-normal.woff2', 'font/woff2']],
  ['/fonts/inter-latin-ext.woff2', ['today/fonts/inter-latin-ext-wght-normal.woff2', 'font/woff2']],
]);
export type ShutdownStage = 'transport:begin' | 'transport:stopped' | 'ai:begin' | 'ai:end' | 'github:begin' | 'github:end'
  | 'plans:begin' | 'plans:end' | 'handlers:draining' | 'database:begin' | 'database:end' | 'workspace:closed';

export async function startWorkspaceServer(options: {
  dataDirectory: string; clock?: () => Date; workspaceLabel?: string | null; github?: GitHubService; ai?: AiService; planGenerator?: PlanGenerator;
  dsh?: DshService;
  compatible?: CompatibleService;
  namedApis?: Partial<Record<NamedApi, CompatibleService>>;
  onShutdown?: (stage: ShutdownStage) => void;
  onInterfaceReady?: () => void;
  appVersion?: string;
}): Promise<LocalServer> {
  const store = await openWorkspaceStore(join(options.dataDirectory, 'tracker.db'), options.clock);
  const trace = (stage: ShutdownStage) => { options.onShutdown?.(stage); };
  const taskApi = { ...store.tasks, snapshot: store.snapshot };
  const workspaces = createWorkspaceService(store.execution, store.projectRepository, join(options.dataDirectory, '..', 'coding-workspaces'));
  const approvals = createApprovalBroker();
  const previews = createPreviewService(store.execution);
  const ai = options.ai ?? createAiService({ installed: async () => false, run: async () => { throw new Error('No desktop runtime'); } });
  const projectContext = (id: string) => {
    const goal = store.projectRepository.findProject(id)?.description;
    const changes = store.execution.recentChanges(id).map(({ title, run }) =>
      title + (run.headSha ? ' [' + run.headSha + ']' : '') + (run.summary ? ': ' + run.summary.slice(0, 300) : ''));
    const settings = store.projectSettings.read(id);
    return ['Project context revision ' + settings.revision, goal && 'Project goal: ' + goal, projectInstructions(settings),
      changes.length && 'Recent merged work (model summaries when available):\n' + changes.join('\n')].filter(Boolean).join('\n\n');
  };
  const providers = createAiProviders(ai, options.dsh, undefined, options.compatible, options.namedApis);
  const coding = createCodingService(store.execution,store.projectRepository,store.projectTransaction,ai,approvals,options.github?.issues,store.linkedWork,projectContext,providers,id => store.projectSettings.read(id).tokenBudget ?? 0, id => store.projectSettings.read(id).revision);
  const ticketAi = createTicketAi(store.projectRepository, store.projectTransaction, store.projectSettings, providers, projectContext);
  const plans = createPlanService(store.planDrafts, options.planGenerator ?? createPlanGenerator(providers), store.planApproval, projectContext);
  const publications = createPublicationService(store.publications, store.projects, store.projectTransaction, options.github?.issues);
  const linkedWork = createLinkedWorkService(store.linkedWork, store.projectRepository, store.projectTransaction, options.github?.issues);
  const delivery=createDeliveryService(store.execution,store.projectRepository,store.linkedWork,store.projectTransaction,options.github?.coding);
  const reviews=createReviewService(store.execution,store.projectRepository,store.linkedWork,store.projectTransaction,ai,options.github?.review,id=>coding.stopForMerge(id),providers,projectContext);
  let quickStart = false;
  let ready = false;
  let projectRequests = 0;
  const local = await listenLocal(async (request, response, origin) => {
    let projectRequest = false;
    try {
      secureRequest(request, response, origin);
      const resource = request.url ?? '';
      projectRequest = /^\/api\/(?:projects|milestones|project-tickets)(?:[/?]|$)/.test(resource);
      if (projectRequest) projectRequests++;
      const reviewRoute=/^\/api\/project-tickets\/([a-f0-9-]{36})\/coding\/review(?:\/(refresh|observe|ask|approve|cancel|close-issue))?$/.exec(resource);
      if(reviewRoute&&(reviewRoute[2]?request.method==='POST':request.method==='GET')){
        const id=reviewRoute[1]!,action=reviewRoute[2],input=action?await readJson(request,origin,16384):undefined;
        const result=!action?reviews.state(id):action==='refresh'?await reviews.refresh(id):action==='observe'?await reviews.observe(id):action==='ask'?reviews.ask(id,input):action==='approve'?await reviews.approve(id,input):action==='cancel'?reviews.cancel(id):await reviews.closeIssue(id,input);
        sendJson(response,200,result);return;
      }
      const deliveryRoute=/^\/api\/project-tickets\/([a-f0-9-]{36})\/coding\/delivery(?:\/(preview|publish|reconcile))?$/.exec(resource);
      if(deliveryRoute&&(deliveryRoute[2]?request.method==='POST':request.method==='GET')){
        const id=deliveryRoute[1]!,action=deliveryRoute[2];const input=action?await readJson(request,origin,8192):undefined;
        sendJson(response,200,!action?delivery.state(id):action==='preview'?await delivery.preview(id):action==='publish'?await delivery.publish(id,input):await delivery.reconcile(id));return;
      }
      const patchApproval = /^\/api\/project-tickets\/([a-f0-9-]{36})\/coding\/patch\/apply$/.exec(resource);
      if (request.method === 'POST' && patchApproval?.[1]) {
        sendJson(response, 200, coding.applyPatch(patchApproval[1], await readJson(request, origin, 8192))); return;
      }
      const runRoute=/^\/api\/project-tickets\/([a-f0-9-]{36})\/coding\/run(?:\/(start|resume|cancel|recover))?$/.exec(resource);
      if(runRoute&&(runRoute[2]?request.method==='POST':request.method==='GET')){
        const id=runRoute[1]!;
        if(runRoute[2]){const input=await readJson(request,origin,16384);if(runRoute[2]==='cancel')coding.cancel(id);
          else if(runRoute[2]==='recover')coding.recover(id);else coding.begin(id,input,runRoute[2]==='resume');}
        sendJson(response,200,coding.state(id));return;
      }
      const quick = /^\/api\/project-tickets\/([a-f0-9-]{36})\/quick-run\/(details|start)$/.exec(resource);
      if (request.method === 'POST' && quick?.[1]) {
        if (quickStart) throw new ExecutionFailure('BUSY', 'Another ticket is preparing to start.');
        quickStart = true;
        try {
          const id = quick[1], ticket = store.projectRepository.findTicket(id);
          if (!ticket || ticket.executionMode !== 'codex') throw new ProjectInputError('Choose a coding ticket.');
          const input = await readJson(request, origin, 16384) as Record<string, unknown> | null;
          const view = store.projects.view(ticket.projectId), settings = store.projectSettings.read(ticket.projectId);
          if (ticket.status !== 'backlog' || ticket.blockReason || unfinishedPrerequisites(id, view.tickets, view.dependencies).length) {
            throw new ProjectInputError('Finish prerequisites and clear blockers before starting.');
          }
          if (!options.github || !settings.sourcePath) throw new ProjectInputError('Connect GitHub and save the local repository folder in project settings.');
          const existing = store.execution.workspace(id);
          const destination = await options.github.issues.inspect(ticket.projectId);
          if (existing?.state === 'ready' && JSON.stringify(existing.repository) !== JSON.stringify(destination)) {
            throw new ProjectInputError('The saved worktree and current repository differ. Reopen project settings.');
          }
          const checked = existing?.state === 'ready' ? null : await workspaces.inspect(id, { sourcePath: settings.sourcePath }, destination);
          const headSha = existing?.state === 'ready' ? existing.baseSha : checked!.headSha;
          const scope = createHash('sha256').update(JSON.stringify([ticket, destination, headSha, settings, projectContext(ticket.projectId)])).digest('hex');
          const savedBatch = publications.state(ticket.projectId).batch;
          const unfinishedIssue = savedBatch?.items.some(item => item.content.ticketId === id && item.stage !== 'published');
          const needsPublication = !ticket.coding?.issueNumber || unfinishedIssue;
          if (quick[2] === 'details') {
            let batch = null;
            if (needsPublication) {
              const publication = await publications.preview(ticket.projectId, id);
              batch = publication.batch;
              if (batch?.items.length !== 1 || batch.items[0]?.content.ticketId !== id) throw new PublicationError('Finish the existing publication batch from the project first.');
            }
            sendJson(response, 200, { scope, batch, destination, headSha, estimate: Math.ceil([projectContext(ticket.projectId), ticket.title, ticket.description, ticket.acceptanceCriteria].join('\n').length / 4), budget: settings.tokenBudget ?? 0, selection: settings.execution });
            return;
          }
          if (!input || input.scope !== scope || input.confirm !== true) throw new ProjectInputError('The ticket scope changed. Open the current run preview.');
          let selection;
          try { selection = parseAiModelSelection(input.selection); }
          catch { throw new ProjectInputError('Choose a valid model.'); }
          if (!selection.model || !supportsSelection(await providers.models(selection.provider, AbortSignal.timeout(30000)), selection)) {
            throw new ProjectInputError('Refresh models and choose an available model and effort.');
          }
          if (selection.provider !== 'codex' && !patchFiles(input.files).length) throw new ProjectInputError('List the tracked files this model can edit.');
          if (needsPublication) {
            const batch = publications.state(ticket.projectId).batch;
            if (batch?.items.length !== 1 || batch.items[0]?.content.ticketId !== id || batch.id !== input.batchId) {
              throw new PublicationError('Reopen the current Issue preview.');
            }
            publications.start(ticket.projectId, { batchId: batch.id, confirm: true });
            const result = await publications.wait(ticket.projectId);
            if (result.batch?.items[0]?.stage !== 'published') throw new PublicationError(result.batch?.items[0]?.message || result.message);
          }
          if (existing?.state !== 'ready') await workspaces.prepare(id, { sourcePath: settings.sourcePath, headSha, confirm: true });
          const latest = store.projectRepository.findTicket(id);
          if (!latest || latest.title !== ticket.title || latest.description !== ticket.description
            || latest.acceptanceCriteria !== ticket.acceptanceCriteria || store.projectSettings.read(ticket.projectId).revision !== settings.revision) {
            throw new ProjectInputError('The ticket or project settings changed during setup. Review the current scope before starting.');
          }
          const before = coding.state(id);
          sendJson(response, 200, coding.begin(id, { confirmScope: true, confirmAllowance: true,
            requirementsToken: before.requirementsToken, selection, files: input.files, allowChecks: input.allowChecks }));
        } finally { quickStart = false; }
        return;
      }
      const preview = /^\/api\/project-tickets\/([a-f0-9-]{36})\/preview(?:\/(start|stop))?$/.exec(resource);
      if (preview?.[1] && request.method === (preview[2] ? 'POST' : 'GET')) {
        const id = preview[1], ticket = store.projectRepository.findTicket(id);
        if (!ticket) throw new ProjectNotFoundError('Ticket not found.');
        if (!preview[2]) { sendJson(response, 200, await previews.state(id)); return; }
        await readJson(request, origin, 4096);
        const workspace = store.execution.workspace(id);
        if (!workspace) throw new ExecutionFailure('NO_WORKSPACE', 'Prepare this ticket worktree first.');
        sendJson(response, 200, preview[2] === 'stop' ? await previews.stop(id)
          : await previews.start(workspace, store.projectSettings.read(ticket.projectId).preview));
        return;
      }
      const ticketAiRoute = /^\/api\/project-tickets\/([a-f0-9-]{36})\/ai(?:\/(run|apply|stop))?$/.exec(resource);
      if (ticketAiRoute?.[1] && request.method === (ticketAiRoute[2] ? 'POST' : 'GET')) {
        const [ , id, action ] = ticketAiRoute;
        const input = action ? await readJson(request, origin, 200000) : undefined;
        sendJson(response, 200, action === 'run' ? await ticketAi.run(id!, input)
          : action === 'apply' ? ticketAi.apply(id!, input) : action === 'stop' ? ticketAi.cancel(id!) : ticketAi.read(id!));
        return;
      }
      const approvalRoute = /^\/api\/project-tickets\/([a-f0-9-]{36})\/coding\/approval$/.exec(resource);
      if (approvalRoute && (request.method === 'GET' || request.method === 'POST')) {
        const id=approvalRoute[1]!; workspaces.read(id);
        if (request.method==='POST') approvals.decide(id,await readJson(request,origin,4096));
        sendJson(response,200,{ticketId:id,approval:approvals.state(id)});return;
      }
      const codingRoute = matchCodingRoute(request.method, resource);
      if (codingRoute) {
        const input = request.method === 'GET' ? undefined : await readJson(request, origin, 8192);
        sendJson(response, 200, await dispatchWorkspaceRoute(codingRoute, input, workspaces)); return;
      }
      if (request.method === 'GET' && resource === '/api/build') { sendJson(response, 200, await readBuildInfo(!!options.workspaceLabel, options.appVersion)); return; }
      if (request.method === 'POST' && resource === '/api/runtime/ready') {
        const value = await readJson(request, origin, 256);
        if (!value || typeof value !== 'object' || !('ready' in value) || value.ready !== true) throw new HttpError(400, 'Confirm interface readiness.');
        if (!ready) { ready = true; options.onInterfaceReady?.(); }
        sendJson(response, 200, { ready: true }); return;
      }
      if (resource === '/api/interface' && (request.method === 'GET' || request.method === 'POST')) {
        if (request.method === 'POST') {
          const settings = await readJson(request, origin, 512);
          if (!isInterface(settings)) throw new HttpError(400, 'Invalid interface settings.');
          store.saveInterface(settings);
        }
        sendJson(response, 200, store.interfaceSettings()); return;
      }
      const asset = assets.get(resource);
      if (request.method === 'GET' && asset) {
        const [name, type] = asset;
        if (type!.startsWith('font/')) {
          // Fonts are binary and change only with a dependency update.
          const font = await readFile(new URL(`../../public/${name}`, import.meta.url));
          response.writeHead(200, { 'Content-Type': type!, 'Cache-Control': 'max-age=86400' });
          response.end(font);
          return;
        }
        let content = await readFile(new URL(`../../public/${name}`, import.meta.url), 'utf8');
        if (resource === '/') {
          const label = (options.workspaceLabel ?? '').replace(/[&<>"']/g, character => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
          })[character]!);
          const notice = label ? `<div class="workspace-notice" role="note"><strong>Separate workspace</strong> &middot; ${label}. Your everyday data stays separate.</div>` : '';
          content = content.replace('<!-- workspace-notice-placeholder -->', notice);
          if (label) content = content.replace('<title>FocusFlow</title>', `<title>FocusFlow - ${label} - Separate workspace</title>`);
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
      const suggestedRepo = /^\/api\/projects\/([a-f0-9-]{36})\/repository-suggestion$/.exec(resource);
      if (request.method === 'GET' && suggestedRepo?.[1]) {
        store.projects.view(suggestedRepo[1]);
        const path = store.projectSettings.read(suggestedRepo[1]).sourcePath;
        let name = '';
        try {
          if (path) name = repositoryName(await git(path, ['remote', 'get-url', 'origin']));
        } catch { /* Manual repository entry remains available. */ }
        sendJson(response, 200, { name });
        return;
      }
      const contextReferences = /^\/api\/projects\/([a-f0-9-]{36})\/context\/references$/.exec(resource);
      if (request.method === 'GET' && contextReferences?.[1]) {
        const id = contextReferences[1];
        store.projects.view(id);
        const folder = store.projectSettings.read(id).sourcePath;
        if (!folder) throw new ProjectInputError('Save a local repository folder first.');
        const revision = await git(folder, ['rev-parse', '--verify', 'HEAD']);
        const paths = ['README.md', 'AGENTS.md', 'docs/ARCHITECTURE.md'];
        const tree = await git(folder, ['ls-tree', '-r', '--full-tree', revision, '--', ...paths]);
        const files: RepositoryContext['files'] = [];
        for (const path of paths) {
          const entry = tree.split('\n').find(line => /^100(?:644|755) blob /.test(line) && line.endsWith('\t' + path));
          if (!entry) continue;
          const size = Number(await git(folder, ['cat-file', '-s', revision + ':' + path]));
          if (!Number.isSafeInteger(size) || size < 1 || size > 65536) continue;
          const content = await git(folder, ['cat-file', 'blob', revision + ':' + path]);
          if (content.includes('\0')) continue;
          const excerpt = content.slice(0, 1500).replace(/[\uD800-\uDBFF]$/, '').trimEnd();
          if (excerpt) files.push({ path, excerpt, truncated: excerpt.length < content.length });
        }
        sendJson(response, 200, { revision, files } satisfies RepositoryContext);
        return;
      }
      const settings = /^\/api\/projects\/([a-f0-9-]{36})\/settings$/.exec(resource);
      if (settings?.[1] && (request.method === 'GET' || request.method === 'POST')) {
        const id = settings[1];
        store.projects.view(id);
        const input = request.method === 'POST' ? await readJson(request, origin, 100000) : undefined;
        sendJson(response, 200, request.method === 'POST' ? store.projectSettings.save(id, input) : store.projectSettings.read(id));
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
        sendJson(response, 200, await dispatchAiRoute(aiRoute, input, ai, providers, options.dsh, options.compatible, options.namedApis));
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
      if (request.method === 'GET' && resource === '/api/personal') {
        sendJson(response, 200, store.personal.view()); return;
      }
      const personalAction = /^\/api\/personal\/(rule|remove|reward|preferences|pin|log|redeem|reverse|edit)$/.exec(resource);
      if (request.method === 'POST' && personalAction?.[1]) {
        sendJson(response, 200, store.personal.mutate(personalAction[1], await readJson(request, origin, 4096))); return;
      }
      const route = matchTaskRoute(request.method, resource);
      const projectRoute = matchProjectRoute(request.method, resource);
      if (!route && !projectRoute) {
        sendJson(response, 404, { error: 'Not found' });
        return;
      }
      const input = request.method === 'GET' ? undefined : await readJson(request, origin, projectRoute ? 32768 : 4096);
      if (projectRoute?.kind === 'deleteProject') {
        const id = projectRoute.id;
        if (projectRequests > 1 || plans.status(id).busy || publications.state(id).busy
          || store.projectRepository.listTickets(id).some(ticket => (reviews.busy(ticket.id) || ticketAi.busy(ticket.id) || previews.owned(ticket.id)))) {
          throw new ProjectInputError('Wait for the current project work to finish, then retry deletion.');
        }
      }
      const result = route ? await dispatchTaskRoute(route, input, taskApi)
        : dispatchProjectRoute(projectRoute!, input, store.projects);
      sendJson(response, result.status, result.body);
    } catch (error) {
      if (response.headersSent) {
        response.end();
        return;
      }
      const known = error instanceof HttpError || error instanceof TaskInputError || error instanceof ProjectInputError || error instanceof ProjectNotFoundError || error instanceof PlanInputError || error instanceof PublicationError || error instanceof LinkedWorkError || error instanceof ExecutionFailure;
      const status = error instanceof HttpError ? error.status : error instanceof ProjectNotFoundError ? 404
        : error instanceof TaskInputError || error instanceof ProjectInputError || error instanceof PlanInputError || error instanceof PublicationError || error instanceof LinkedWorkError || error instanceof ExecutionFailure ? 400 : 500;
      sendJson(response, status, {
        error: known ? error.message : 'Could not save local data. Check disk space and try again.',
      });
    } finally {
      if (projectRequest) projectRequests--;
    }
  }, () => { trace('database:begin'); store.close(); trace('database:end'); }, async () => {
    trace('transport:stopped');
    workspaces.close();
    ticketAi.close();
    options.compatible?.close();
    Object.values(options.namedApis ?? {}).forEach(api => api.close());
    approvals.close();
    const results = await Promise.allSettled([
      coding.close(),
      previews.close(),
      delivery.close(),
      reviews.close(),
      (async () => { trace('plans:begin'); await plans.close(); trace('plans:end'); })(),
      publications.close(),
      (async () => { trace('ai:begin'); await ai.close(); trace('ai:end'); })(),
      options.dsh?.close(),
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
