import { executionRecord } from './execution.ts';

export interface CodingApproval {
  id: string; runId: string; ticketId: string; kind: 'command' | 'file';
  command: string; workingDirectory: string; reason: string; paths: string[];
  createdAt: string; expiresAt: string;
}
export function parseApproval(value: unknown, ticketId: string): CodingApproval | null {
  if (value === null) return null;
  const a = executionRecord(value);
  if (a.ticketId !== ticketId || typeof a.id !== 'string' || !/^[a-f0-9-]{36}$/.test(a.id)
    || typeof a.runId !== 'string' || !/^[a-f0-9-]{36}$/.test(a.runId) || !['command','file'].includes(String(a.kind))
    || typeof a.command !== 'string' || a.command.length > 4000 || typeof a.workingDirectory !== 'string' || a.workingDirectory.length > 2000
    || typeof a.reason !== 'string' || a.reason.length > 2000 || !Array.isArray(a.paths) || a.paths.length > 30
    || !a.paths.every(p => typeof p === 'string' && p.length <= 2000)
    || typeof a.createdAt !== 'string' || !Number.isFinite(Date.parse(a.createdAt)) || typeof a.expiresAt !== 'string' || !Number.isFinite(Date.parse(a.expiresAt))) throw new Error('The permission request is invalid or stale.');
  return { id:a.id, runId:a.runId, ticketId, kind:a.kind as CodingApproval['kind'], command:a.command,
    workingDirectory:a.workingDirectory, reason:a.reason, paths:a.paths as string[], createdAt:a.createdAt, expiresAt:a.expiresAt };
}
