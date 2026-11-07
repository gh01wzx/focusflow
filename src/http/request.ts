import type { IncomingMessage, ServerResponse } from 'node:http';

export class HttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function sendJson(response: ServerResponse, status: number, body: unknown): void {
  if (response.destroyed || response.writableEnded) return;
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}

export function secureRequest(request: IncomingMessage, response: ServerResponse, origin: string): void {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Content-Security-Policy', "default-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'");
  if (request.headers.host !== new URL(origin).host) throw new HttpError(403, 'Invalid host');
  if (request.headers.origin && request.headers.origin !== origin) throw new HttpError(403, 'Invalid origin');
}

export async function readJson(request: IncomingMessage, origin: string, limit = 4096): Promise<unknown> {
  if (request.headers.origin !== origin) throw new HttpError(403, 'Origin required');
  if (request.headers['content-type'] !== 'application/json') throw new HttpError(415, 'JSON required');
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > limit) throw new HttpError(413, 'Request too large');
    chunks.push(buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } catch {
    throw new HttpError(400, 'Invalid JSON');
  }
}
