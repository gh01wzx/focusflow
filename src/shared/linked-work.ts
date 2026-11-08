import type { GitHubRepository } from './github.ts';
import { parseGitHubRepository } from './github.ts';

export interface LinkedFields { title: string; description: string; acceptanceCriteria: string }
export interface LinkedIssue { number: number; title: string; body: string; state: 'open' | 'closed'; updatedAt: string }
export interface LinkedPull extends LinkedIssue { headSha: string; merged: boolean; mergeCommitSha: string | null }
export interface LinkedWorkState {
  ticketId: string; repository: GitHubRepository; issueNumber: number; local: LinkedFields; remote: LinkedIssue | null;
  pullNumber: number | null; pull: LinkedPull | null; lastSuccess: string | null; error: string; token: string;
  localChanged: boolean | null; remoteChanged: boolean | null; matches: boolean; remoteFields: LinkedFields | null;
}
export function issueFields(issue: LinkedIssue, ticketId?: string): LinkedFields | null {
  const body = issue.body.replace(/\r\n/g, '\n').trimEnd();
  if ((body.match(/^## Why this helps$/gm)?.length ?? 0) !== 1 || (body.match(/^## How to check$/gm)?.length ?? 0) !== 1
    || (body.match(/^## Needed first$/gm)?.length ?? 0) > 1 || ticketId && !body.endsWith('<!-- focusflow-ticket:' + ticketId + ' -->')) return null;
  const match = /^## Why this helps\n\n([\s\S]*?)\n\n## How to check\n\n([\s\S]*?)(?:\n\n## Needed first\n\n[\s\S]*?)?\n\n<!-- focusflow-ticket:[a-f0-9-]{36} -->$/.exec(body);
  if (!match) return null;
  const title = issue.title.replace(new RegExp('^\\[' + issue.number + '\\]\\s*'), '');
  if (!title.trim() || title.length > 300 || match[1]!.length > 2000 || match[2]!.length > 2000 || /^\[[0-9]+\]/.test(title)) return null;
  return { title: title.trim(), description: match[1]!, acceptanceCriteria: match[2]! };
}
export function parseLinkedIssue(value: unknown): LinkedIssue {
  const item = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  if (!Number.isSafeInteger(item.number) || Number(item.number) < 1 || typeof item.title !== 'string' || item.title.length > 1000
    || typeof item.body !== 'string' || item.body.length > 1000000 || !['open','closed'].includes(String(item.state))
    || typeof item.updatedAt !== 'string' || !Number.isFinite(Date.parse(item.updatedAt))) throw new Error('Invalid linked Issue evidence.');
  return { number: item.number as number, title: item.title, body: item.body, state: item.state as 'open' | 'closed', updatedAt: item.updatedAt };
}
export function parseLinkedPull(value: unknown): LinkedPull {
  const item = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  if (typeof item.headSha !== 'string' || !/^[a-f0-9]{40}$/.test(item.headSha) || typeof item.merged !== 'boolean'
    || !(item.mergeCommitSha === null || typeof item.mergeCommitSha === 'string' && /^[a-f0-9]{40}$/.test(item.mergeCommitSha))
    || item.merged && item.mergeCommitSha === null) throw new Error('Invalid linked pull request evidence.');
  return { ...parseLinkedIssue(item), headSha: item.headSha, merged: item.merged, mergeCommitSha: item.mergeCommitSha as string | null };
}
export function parseLinkedWorkState(value: unknown): LinkedWorkState {
  const item = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const fields = (value: unknown): LinkedFields => {
    const f = value && typeof value === 'object' ? value as Record<string, unknown> : {};
    if (typeof f.title !== 'string' || !f.title.trim() || f.title.length > 300 || typeof f.description !== 'string' || f.description.length > 2000
      || typeof f.acceptanceCriteria !== 'string' || f.acceptanceCriteria.length > 2000) throw new Error('Invalid linked requirements.');
    return { title: f.title, description: f.description, acceptanceCriteria: f.acceptanceCriteria };
  };
  if (typeof item.ticketId !== 'string' || !/^[a-f0-9-]{36}$/.test(item.ticketId) || !Number.isSafeInteger(item.issueNumber) || Number(item.issueNumber) < 1
    || !(item.pullNumber === null || Number.isSafeInteger(item.pullNumber) && Number(item.pullNumber) > 0)
    || !(item.lastSuccess === null || typeof item.lastSuccess === 'string' && Number.isFinite(Date.parse(item.lastSuccess)))
    || typeof item.error !== 'string' || item.error.length > 600 || typeof item.token !== 'string' || !/^[a-f0-9]{64}$/.test(item.token)
    || ![null,true,false].includes(item.localChanged as null | boolean) || ![null,true,false].includes(item.remoteChanged as null | boolean)
    || typeof item.matches !== 'boolean') throw new Error('Could not read linked work.');
  const remote = item.remote === null ? null : parseLinkedIssue(item.remote), pull = item.pull === null ? null : parseLinkedPull(item.pull);
  if (remote && remote.number !== item.issueNumber || pull && pull.number !== item.pullNumber) throw new Error('Linked identity changed.');
  return { ticketId: item.ticketId, repository: parseGitHubRepository(item.repository), issueNumber: item.issueNumber as number,
    local: fields(item.local), remote, pullNumber: item.pullNumber as number | null, pull, lastSuccess: item.lastSuccess as string | null,
    error: item.error, token: item.token, localChanged: item.localChanged as boolean | null, remoteChanged: item.remoteChanged as boolean | null,
    matches: item.matches, remoteFields: item.remoteFields === null ? null : fields(item.remoteFields) };
}
