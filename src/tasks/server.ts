import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { openTaskStore } from './store.ts';
import { TaskInputError } from './model.ts';

export interface LocalServer {
  origin: string;
  close(): Promise<void>;
}

const assets = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/style.css', ['style.css', 'text/css; charset=utf-8']],
]);
export async function startTaskServer(options: { dataDirectory: string; clock?: () => Date }): Promise<LocalServer> {
  const store = await openTaskStore(join(options.dataDirectory, 'tracker.db'), options.clock);
  let origin = '';
  const server = createServer(async (request, response) => {
    const send = (status: number, body: unknown) => {
      response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify(body));
    };
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Content-Security-Policy', "default-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'");
    if (request.headers.host !== new URL(origin).host) return send(403, { error: 'Invalid host' });
    if (request.headers.origin && request.headers.origin !== origin) return send(403, { error: 'Invalid origin' });
    try {
      const resource = request.url ?? '';
      const asset = assets.get(resource);
      if (request.method === 'GET' && asset) {
        const [name, type] = asset;
        const content = await readFile(new URL(`../../public/today/${name}`, import.meta.url));
        response.writeHead(200, { 'Content-Type': type! });
        response.end(content); return;
      }
      if (request.method === 'GET' && resource === '/api/tasks') return send(200, store.view());
      const match = /^\/api\/tasks\/([a-f0-9-]{36})\/resolve$/.exec(resource);
      const stopMatch = /^\/api\/recurrences\/([a-f0-9-]{36})\/stop$/.exec(resource);
      if (request.method !== 'POST' || (resource !== '/api/tasks' && !match && !stopMatch && resource !== '/api/recurrences' && resource !== '/api/tasks/backup')) return send(404, { error: 'Not found' });
      if (request.headers.origin !== origin) return send(403, { error: 'Origin required' });
      if (request.headers['content-type'] !== 'application/json') return send(415, { error: 'JSON required' });
      const chunks: Buffer[] = []; let size = 0;
      for await (const chunk of request) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        size += buffer.length;
        if (size > 4096) return send(413, { error: 'Request too large' });
        chunks.push(buffer);
      }
      let input: unknown;
      try { input = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
      catch { return send(400, { error: 'Invalid JSON' }); }
      if (resource === '/api/tasks/backup') {
        const snapshot = await store.snapshot();
        return send(201, { name: snapshot.name });
      }
      if (resource === '/api/tasks') return send(201, { task: store.add(input), view: store.view() });
      if (resource === '/api/recurrences') return send(201, { rule: store.addRecurrence(input), view: store.view() });
      if (stopMatch) {
        const rule = store.stopRecurrence(stopMatch[1]!);
        return rule ? send(200, { rule, view: store.view() }) : send(404, { error: 'Repeating task not found' });
      }
      const status = typeof input === 'object' && input !== null && 'status' in input ? input.status : undefined;
      const task = store.resolve(match![1]!, status);
      return task ? send(200, { task, view: store.view() }) : send(404, { error: 'Task not found' });
    } catch (error) {
      if (!response.headersSent) send(error instanceof TaskInputError ? 400 : 500, {
        error: error instanceof TaskInputError ? error.message : 'Could not save local data. Check disk space and try again.',
      });
      else response.end();
    }
  });
  try { await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); }); }
  catch (error) { store.close(); throw error; }
  const address = server.address();
  if (!address || typeof address === 'string') { server.close(); store.close(); throw new Error('EXPECTED_TCP_ADDRESS'); }
  origin = `http://127.0.0.1:${address.port}`;
  return { origin, close: () => new Promise<void>((resolve, reject) => {
    server.close(error => { store.close(); error ? reject(error) : resolve(); });
    server.closeIdleConnections();
  }) };
}
