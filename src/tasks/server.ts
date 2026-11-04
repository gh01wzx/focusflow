import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { listenLocal } from '../http/local-server.ts';
import type { LocalServer } from '../http/local-server.ts';
import { HttpError, readJson, secureRequest, sendJson } from '../http/request.ts';
import { openTaskStore } from './store.ts';
import { matchTaskRoute, dispatchTaskRoute } from './routes.ts';
import { TaskInputError } from './validation.ts';

const assets = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/style.css', ['style.css', 'text/css; charset=utf-8']],
]);

export async function startTaskServer(options: { dataDirectory: string; clock?: () => Date }): Promise<LocalServer> {
  const store = await openTaskStore(join(options.dataDirectory, 'tracker.db'), options.clock);
  return listenLocal(async (request, response, origin) => {
    try {
      secureRequest(request, response, origin);
      const resource = request.url ?? '';
      const asset = assets.get(resource);
      if (request.method === 'GET' && asset) {
        const [name, type] = asset;
        const content = await readFile(new URL(`../../public/today/${name}`, import.meta.url));
        response.writeHead(200, { 'Content-Type': type! });
        response.end(content);
        return;
      }
      const route = matchTaskRoute(request.method, resource);
      if (!route) {
        sendJson(response, 404, { error: 'Not found' });
        return;
      }
      const input = route.kind === 'view' ? undefined : await readJson(request, origin);
      const result = await dispatchTaskRoute(route, input, store);
      sendJson(response, result.status, result.body);
    } catch (error) {
      if (response.headersSent) {
        response.end();
        return;
      }
      const known = error instanceof HttpError || error instanceof TaskInputError;
      const status = error instanceof HttpError ? error.status : error instanceof TaskInputError ? 400 : 500;
      sendJson(response, status, {
        error: known ? error.message : 'Could not save local data. Check disk space and try again.',
      });
    }
  }, store.close);
}
