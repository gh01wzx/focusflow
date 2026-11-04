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

export async function startWorkspaceServer(options: { dataDirectory: string; clock?: () => Date }): Promise<LocalServer> {
  const store = await openWorkspaceStore(join(options.dataDirectory, 'tracker.db'), options.clock);
  const taskApi = { ...store.tasks, snapshot: store.snapshot };
  return listenLocal(async (request, response, origin) => {
    try {
      secureRequest(request, response, origin);
      const resource = request.url ?? '';
      const asset = assets.get(resource);
      if (request.method === 'GET' && asset) {
        const [name, type] = asset;
        const content = await readFile(new URL(`../../public/${name}`, import.meta.url));
        response.writeHead(200, { 'Content-Type': type! });
        response.end(content);
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
      const known = error instanceof HttpError || error instanceof TaskInputError || error instanceof ProjectInputError || error instanceof ProjectNotFoundError;
      const status = error instanceof HttpError ? error.status : error instanceof ProjectNotFoundError ? 404
        : error instanceof TaskInputError || error instanceof ProjectInputError ? 400 : 500;
      sendJson(response, status, {
        error: known ? error.message : 'Could not save local data. Check disk space and try again.',
      });
    }
  }, store.close);
}
