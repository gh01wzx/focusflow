import { parseGitHubRepository } from './github.ts';
import type { GitHubRepository } from './github.ts';

export type PublicationStage = 'pending' | 'creating' | 'uncertain' | 'linked' | 'published' | 'conflict';
export interface IssueContent {
  ticketId: string; title: string; description: string; acceptanceCriteria: string;
  prerequisites: { ticketId: string; title: string; issueNumber?: number | null }[]; privatePrerequisites: number;
}
export interface PublicationItem { content: IssueContent; stage: PublicationStage; issueNumber: number | null; message: string }
export interface PublicationBatch {
  id: string; projectId: string; repository: GitHubRepository; approvedAt: string | null; items: PublicationItem[];
}
export interface PublicationState { batch: PublicationBatch | null; busy: boolean; message: string }
export class IssueCreationRefused extends Error {}
export const publicationMarker = (ticketId: string) => '<!-- focusflow-ticket:' + ticketId + ' -->';
export function issueTitle(content: IssueContent, number?: number | null): string {
  return '[' + (number ?? 'assigned Issue number') + '] ' + content.title;
}
export function issueBody(content: IssueContent, numbers: ReadonlyMap<string, number> = new Map()): string {
  const dependencies = content.prerequisites.map(item => '- ' + ((numbers.get(item.ticketId) ?? item.issueNumber) ? '#' + (numbers.get(item.ticketId) ?? item.issueNumber) : '(Issue number assigned on publication)') + ' ' + item.title);
  if (content.privatePrerequisites) dependencies.push('- ' + content.privatePrerequisites + ' manual prerequisite(s) tracked privately in FocusFlow.');
  return '## Why this helps\n\n' + content.description + '\n\n## How to check\n\n' + content.acceptanceCriteria
    + (dependencies.length ? '\n\n## Needed first\n\n' + dependencies.join('\n') : '') + '\n\n' + publicationMarker(content.ticketId);
}
export function parsePublicationState(value: unknown): PublicationState {
  const fail = () => { throw new Error('Could not read publication results. Reopen the dialog before retrying.'); };
  const object = (value: unknown): Record<string, unknown> => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return fail();
    return value as Record<string, unknown>;
  };
  const id = (value: unknown): string => typeof value === 'string' && /^[a-f0-9-]{36}$/.test(value) ? value : fail();
  const text = (value: unknown, max: number): string => typeof value === 'string' && value.length <= max ? value : fail();
  const state = object(value);
  if (typeof state.busy !== 'boolean') fail();
  let batch: PublicationBatch | null = null;
  if (state.batch !== null) {
    const item = object(state.batch);
    if (!Array.isArray(item.items) || item.items.length < 1 || item.items.length > 200) fail();
    if (item.approvedAt !== null && (typeof item.approvedAt !== 'string' || !Number.isFinite(Date.parse(item.approvedAt)))) fail();
    const items = (item.items as unknown[]).map((value): PublicationItem => {
      const row = object(value), c = object(row.content);
      if (!['pending','creating','uncertain','linked','published','conflict'].includes(String(row.stage))
        || !(row.issueNumber === null || Number.isSafeInteger(row.issueNumber) && Number(row.issueNumber) > 0)
        || !Number.isSafeInteger(c.privatePrerequisites) || Number(c.privatePrerequisites) < 0 || !Array.isArray(c.prerequisites)) fail();
      if ((row.stage === 'linked' || row.stage === 'published') && row.issueNumber === null) fail();
      const prerequisites = (c.prerequisites as unknown[]).map(value => {
        const p = object(value);
        if (!(p.issueNumber == null || Number.isSafeInteger(p.issueNumber) && Number(p.issueNumber) > 0)) fail();
        return { ticketId: id(p.ticketId), title: text(p.title, 300), ...(p.issueNumber === undefined ? {} : { issueNumber: p.issueNumber as number | null }) };
      });
      return { stage: row.stage as PublicationStage, issueNumber: row.issueNumber as number | null, message: text(row.message, 600),
        content: { ticketId: id(c.ticketId), title: text(c.title, 300), description: text(c.description, 2000), acceptanceCriteria: text(c.acceptanceCriteria, 2000),
          prerequisites, privatePrerequisites: c.privatePrerequisites as number } };
    });
    if (new Set(items.map(i => i.content.ticketId)).size !== items.length) fail();
    batch = { id: id(item.id), projectId: id(item.projectId), repository: parseGitHubRepository(item.repository), approvedAt: item.approvedAt as string | null, items };
  }
  return { batch, busy: state.busy as boolean, message: text(state.message, 600) };
}
