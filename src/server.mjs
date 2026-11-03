import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { openStore } from './store.mjs';

const publicFiles = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/style.css', ['style.css', 'text/css; charset=utf-8']],
]);

export async function startServer({ dataDirectory, port = 0 }) {
  const store = openStore(join(dataDirectory, 'phase0.db'));
  let origin;
  const server = createServer(async (request, response) => {
    const send = (status, body) => {
      response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify(body));
    };
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Content-Security-Policy', "default-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    if (request.headers.host !== new URL(origin).host) return send(403, { error: 'Invalid host' });
    if (request.headers.origin && request.headers.origin !== origin) return send(403, { error: 'Invalid origin' });
    try {
      if (request.method === 'GET' && publicFiles.has(request.url)) {
        const [file, contentType] = publicFiles.get(request.url);
        const content = await readFile(new URL(`../public/${file}`, import.meta.url));
        response.writeHead(200, { 'Content-Type': contentType });
        return response.end(content);
      }
      if (request.method === 'GET' && request.url === '/api/probe') return send(200, { note: store.read(), schemaVersion: 1 });
      if (request.method === 'POST' && ['/api/probe', '/api/backup'].includes(request.url)) {
        if (request.headers.origin !== origin) return send(403, { error: 'Origin required' });
        if (request.headers['content-type'] !== 'application/json') return send(415, { error: 'JSON required' });
        const chunks = [];
        let size = 0;
        for await (const chunk of request) {
          size += chunk.length;
          if (size > 4096) { send(413, { error: 'Request too large' }); return; }
          chunks.push(chunk);
        }
        let input;
        try { input = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return send(400, { error: 'Invalid JSON' }); }
        if (request.url === '/api/probe') {
          try { store.save(input?.note); } catch (error) {
            if (error instanceof TypeError) return send(400, { error: error.message });
            throw error;
          }
          return send(200, { note: store.read() });
        }
        const snapshot = await store.snapshot(join(dataDirectory, 'backups'));
        return send(201, { name: snapshot.name });
      }
      return send(404, { error: 'Not found' });
    } catch {
      // Do not expose local paths or credentials in HTTP errors.
      if (!response.headersSent) send(500, { error: '本地操作失败，请检查可用磁盘空间或重新启动。' });
      else response.end();
    }
  });
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, '127.0.0.1', resolve);
    });
  } catch (error) { store.close(); throw error; }
  origin = `http://127.0.0.1:${server.address().port}`;
  return {
    origin,
    close: () => new Promise((resolve, reject) => {
      server.close(error => { store.close(); error ? reject(error) : resolve(); });
      server.closeIdleConnections();
    }),
  };
}
