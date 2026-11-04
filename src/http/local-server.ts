import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';

export interface LocalServer {
  origin: string;
  close(): Promise<void>;
}

type LocalHandler = (request: IncomingMessage, response: ServerResponse, origin: string) => Promise<void>;

export async function listenLocal(handler: LocalHandler, dispose: () => void): Promise<LocalServer> {
  let origin = '';
  const server = createServer((request, response) => { void handler(request, response, origin); });
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
    close: () => new Promise<void>((resolve, reject) => {
      server.close(error => {
        dispose();
        error ? reject(error) : resolve();
      });
      server.closeIdleConnections();
    }),
  };
}
