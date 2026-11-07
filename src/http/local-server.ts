import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Socket } from 'node:net';

export interface LocalServer {
  origin: string;
  close(): Promise<void>;
}

type LocalHandler = (request: IncomingMessage, response: ServerResponse, origin: string) => Promise<void>;

export async function listenLocal(handler: LocalHandler, dispose: () => void, cancelOwned?: () => Promise<void>): Promise<LocalServer> {
  let origin = '';
  let stopping = false;
  let closing: Promise<void> | undefined;
  const sockets = new Set<Socket>();
  const handlers = new Set<Promise<void>>();
  const server = createServer((request, response) => {
    if (stopping) { response.writeHead(503, { Connection: 'close' }); response.end(); return; }
    const pending = Promise.resolve().then(() => {
      if (!response.destroyed) return handler(request, response, origin);
      return undefined;
    }).catch(() => { response.destroy(); });
    handlers.add(pending);
    void pending.then(() => { handlers.delete(pending); });
  });
  server.on('connection', socket => {
    sockets.add(socket);
    socket.once('close', () => { sockets.delete(socket); });
  });
  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
  } catch (error) {
    dispose();
    throw error;
  }
  const address = server.address();
  if (!address || typeof address === 'string') {
    server.close();
    dispose();
    throw new Error('EXPECTED_TCP_ADDRESS');
  }
  origin = `http://127.0.0.1:${address.port}`;
  return {
    origin,
    close() {
      if (closing) return closing;
      stopping = true;
      const stopped = new Promise<void>((resolve, reject) => {
        server.close(error => { error ? reject(error) : resolve(); });
      });
      // Active or incomplete bodies are not idle. End every owned connection so
      // body readers settle; finish accepted handlers before closing their data.
      for (const socket of sockets) socket.destroy();
      closing = (async () => {
        const results = await Promise.allSettled([stopped, Promise.resolve().then(cancelOwned)]);
        await Promise.all([...handlers]);
        dispose();
        if (results.some(result => result.status === 'rejected')) throw new Error('LOCAL_SERVER_SHUTDOWN_FAILED');
      })();
      return closing;
    },
  };
}
