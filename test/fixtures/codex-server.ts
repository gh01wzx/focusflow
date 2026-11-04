// Deterministic child-process protocol fixture. No Codex binary, credentials or network.
import { createInterface } from 'node:readline';

const mode = process.argv[2];
const lines = createInterface({ input: process.stdin });
const send = (value: unknown) => process.stdout.write(JSON.stringify(value) + '\n');
const terminal = (status: string) => send({ method: 'turn/completed', params: {
  threadId: 'fake-thread', turn: { id: 'fake-turn', status },
} });
if (mode === 'stubborn') setInterval(() => {}, 1000);
lines.on('line', line => {
  const message = JSON.parse(line) as { id?: number; method?: string };
  if (message.method === 'initialize') send({ id: message.id, result: {} });
  if (message.method === 'thread/start') send({ id: message.id, result: { thread: { id: 'fake-thread' } } });
  if (message.method === 'turn/start') {
    send({ method: 'turn/started', params: { threadId: 'fake-thread', turn: { id: 'fake-turn' } } });
    if (mode !== 'pending-start') send({ id: message.id, result: { turn: { id: 'fake-turn' } } });
  }
  if (message.method === 'turn/interrupt') {
    if (mode !== 'ack-only') terminal('interrupted');
    send({ id: message.id, result: {} });
  }
});
