import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';

export interface LocalServer { origin: string; close(): Promise<void> }
type LocalHandler = (request: IncomingMessage, response: ServerResponse, origin: string) => Promise<void>;
type CloseStage = 'draining-requests' | 'connections-closed' | 'store-closed';

export async function listenLocal(handler: LocalHandler, dispose: () => void, observe: (stage: CloseStage) => void = () => {}): Promise<LocalServer> {
  let origin = '';
  let closing = false;
  const active = new Set<Promise<void>>();
  const server = createServer((request, response) => {
    if (closing) { response.writeHead(503); response.end(); return; }
    const operation = handler(request, response, origin).catch(() => { response.destroy(); });
    active.add(operation);
    void operation.finally(() => active.delete(operation));
  });
  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
  } catch (error) { dispose(); throw error; }
  const address = server.address();
  if (!address || typeof address === 'string') { server.close(); dispose(); throw new Error('EXPECTED_TCP_ADDRESS'); }
  origin = 'http://127.0.0.1:' + address.port;
  let close: Promise<void> | undefined;
  const report = (stage: CloseStage) => { try { observe(stage); } catch { /* Diagnostics cannot prevent cleanup. */ } };
  return {
    origin,
    close: () => {
      if (close) return close;
      closing = true;
      report('draining-requests');
      const closed = new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
      server.closeIdleConnections();
      close = (async () => {
        await Promise.allSettled([...active]);
        // Finish real handlers before retiring renderer sockets and the database.
        server.closeAllConnections();
        try { await closed; report('connections-closed'); }
        finally { dispose(); report('store-closed'); }
      })();
      return close;
    },
  };
}
