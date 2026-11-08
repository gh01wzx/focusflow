import { randomUUID } from 'node:crypto';
import type { GitHubRepository } from '../shared/github.ts';
import { issueBody, issueTitle, publicationMarker, IssueCreationRefused } from '../shared/publication.ts';
import type { IssueContent, PublicationState, PublicationBatch } from '../shared/publication.ts';
import type { ProjectService, ProjectTransaction } from '../projects/service.ts';
import type { PublicationRepository } from './repository.ts';

export interface RemoteIssue { number: number; title: string; body: string }
export interface IssueProvider {
  inspect(projectId: string): Promise<GitHubRepository>;
  find(projectId: string, repository: GitHubRepository, marker: string): Promise<RemoteIssue[]>;
  create(projectId: string, repository: GitHubRepository, title: string, body: string): Promise<RemoteIssue>;
  update(projectId: string, repository: GitHubRepository, number: number, title: string, body: string): Promise<RemoteIssue>;
}
export class PublicationError extends Error {}

export function createPublicationService(repository: PublicationRepository, projects: ProjectService, transaction: ProjectTransaction, provider?: IssueProvider) {
  let active: { projectId: string; promise: Promise<void> } | null = null;
  let closing = false;
  const messages = new Map<string, string>();
  function contents(projectId: string): IssueContent[] {
    const view = projects.view(projectId);
    // Draft suggestions are separate records. Formal tickets were saved by the owner or approved from a plan.
    const coding = view.tickets.filter(ticket => ticket.executionMode === 'codex');
    return coding.filter(ticket => !ticket.coding?.issueNumber).map(ticket => {
      const prerequisites = view.dependencies.filter(link => link.ticketId === ticket.id).map(link => view.tickets.find(item => item.id === link.prerequisiteId)!);
      return { ticketId: ticket.id, title: ticket.title, description: ticket.description, acceptanceCriteria: ticket.acceptanceCriteria,
        prerequisites: prerequisites.filter(item => item.executionMode === 'codex').map(item => ({ ticketId: item.id, title: item.title, issueNumber: item.coding?.issueNumber ?? null })),
        privatePrerequisites: prerequisites.filter(item => item.executionMode === 'manual').length };
    });
  }
  function state(projectId: string): PublicationState {
    return { batch: repository.read(projectId), busy: active?.projectId === projectId,
      message: messages.get(projectId) ?? 'Preview approved coding work before any GitHub publication. Manual work stays private.' };
  }
  async function publish(batch: PublicationBatch) {
    const id = batch.projectId;
    try {
      for (const item of batch.items) {
        if (closing) return;
        if (item.issueNumber !== null) continue;
        const matches = await provider!.find(id, batch.repository, publicationMarker(item.content.ticketId));
        if (closing) return;
        if (matches.length > 1) {
          transaction(() => repository.setItem(item.content.ticketId, 'conflict', null, 'Multiple matching Issues exist. Reconcile manually; no new Issue was created.')); return;
        }
        if (matches.length === 1) {
          const found = matches[0]!;
          if (found.title !== item.content.title || found.body !== issueBody(item.content)) {
            transaction(() => repository.setItem(item.content.ticketId, 'conflict', null, 'A matching marker has changed content. Inspect it manually; another Issue is refused.')); return;
          }
          transaction(() => { repository.link(item, batch, matches[0]!.number); repository.setItem(item.content.ticketId, 'linked', matches[0]!.number); });
          continue;
        }
        if (item.stage !== 'pending') {
          transaction(() => repository.setItem(item.content.ticketId, 'uncertain', null, 'An earlier creation may have succeeded. Retry only searches for it; another creation is refused.')); return;
        }
        transaction(() => repository.setItem(item.content.ticketId, 'creating', null));
        try {
          const created = await provider!.create(id, batch.repository, item.content.title, issueBody(item.content));
          transaction(() => { repository.link(item, batch, created.number); repository.setItem(item.content.ticketId, 'linked', created.number); });
        } catch (error) {
          transaction(() => repository.setItem(item.content.ticketId, error instanceof IssueCreationRefused ? 'pending' : 'uncertain', null,
            error instanceof IssueCreationRefused ? 'GitHub refused creation. Check sign-in, Issues write permission, rate limit and approved content before an explicit retry.'
              : 'Creation result is uncertain. Retry to look for the existing Issue; no duplicate will be created.')); return;
        }
      }
      const linked = repository.read(id)!;
      const view = projects.view(id);
      const numbers = new Map(view.tickets.filter(t => t.coding?.issueNumber).map(t => [t.id, t.coding!.issueNumber!]));
      for (const item of linked.items) {
        if (closing) return;
        if (item.stage === 'published' || item.issueNumber === null) continue;
        const matches = await provider!.find(id, linked.repository, publicationMarker(item.content.ticketId));
        const existing = matches.length === 1 ? matches[0] : undefined;
        const title = issueTitle(item.content, item.issueNumber), body = issueBody(item.content, numbers);
        if (!existing || existing.number !== item.issueNumber || ![item.content.title, title].includes(existing.title)
          || ![issueBody(item.content), body].includes(existing.body)) {
          transaction(() => repository.setItem(item.content.ticketId, 'conflict', item.issueNumber, 'The Issue content or identity changed. Existing remote edits are kept; reconcile before continuing.')); return;
        }
        if (closing) return;
        if (existing.title !== title || existing.body !== body) await provider!.update(id, linked.repository, item.issueNumber, title, body);
        transaction(() => repository.setItem(item.content.ticketId, 'published', item.issueNumber));
      }
      messages.set(id, 'Approved coding Issues are linked. Nothing started.');
    } catch {
      messages.set(id, 'Publication stopped. Check GitHub sign-in, Issues write permission, network and repository identity. Existing results are retained; retry resumes only unresolved work.');
    }
  }
  return {
    state,
    async preview(projectId: string) {
      if (closing || active) throw new PublicationError('Wait for the current publication to finish.');
      if (!provider) throw new PublicationError('Publication needs the Windows GitHub connection and an App with Issues read/write permission.');
      const existing = repository.read(projectId);
      if (existing?.approvedAt && existing.items.some(item => item.stage !== 'published')) return state(projectId);
      let linked: GitHubRepository;
      try { linked = await provider.inspect(projectId); } catch { throw new PublicationError('Connect and inspect GitHub first. Check the App repository access; no permission is granted automatically.'); }
      if (closing || active) throw new PublicationError('Publication changed. Reopen before previewing.');
      const items = contents(projectId);
      if (!items.length) throw new PublicationError('Create coding tickets or approve coding tasks from a plan first.');
      if (items.some(item => item.title.length > 200)) throw new PublicationError('Keep coding task titles within 200 characters before publication.');
      if (items.length > 200) throw new PublicationError('Publish a smaller approved plan first.');
      const view = projects.view(projectId);
      const ids = new Set([...items.map(i => i.ticketId), ...view.tickets.filter(t => t.coding?.issueNumber).map(t => t.id)]);
      if (items.some(item => item.prerequisites.some(p => !ids.has(p.ticketId)))) throw new PublicationError('Approve every coding prerequisite before publication.');
      transaction(() => {
        if (existing && !existing.approvedAt) repository.discardUnapproved(existing.id);
        repository.insert({ id: randomUUID(), projectId, repository: linked, approvedAt: null,
          items: items.map(content => ({ content, stage: 'pending', issueNumber: null, message: '' })) });
      });
      return state(projectId);
    },
    start(projectId: string, input: unknown) {
      const value = input && typeof input === 'object' ? input as Record<string, unknown> : {};
      const batch = repository.read(projectId);
      if (!provider || closing || active || !batch || value.batchId !== batch.id || value.confirm !== true) throw new PublicationError('Preview this batch and explicitly approve its publication. Wait for any active publication first.');
      if (!batch.approvedAt) {
        // Compare outside a write transaction; synchronous execution prevents another local mutation here.
        if (JSON.stringify(contents(projectId)) !== JSON.stringify(batch.items.map(item => item.content))) throw new PublicationError('The selected work changed. Preview it again before publication.');
        transaction(now => repository.approve(batch.id, now.toISOString()));
      }
      const owned = { projectId, promise: Promise.resolve() };
      active = owned; messages.set(projectId, 'Publishing the approved batch. Closing does not undo remote writes.');
      owned.promise = publish(repository.read(projectId)!).finally(() => {
        if (active === owned) active = null;
        if (messages.get(projectId)?.startsWith('Publishing')) {
          messages.set(projectId, 'Some publication results need attention. Existing links are retained; retry reconciles unresolved work.');
        }
      });
      return state(projectId);
    },
    abandon(projectId: string, input: unknown) {
      const value = input && typeof input === 'object' ? input as Record<string, unknown> : {};
      const batch = repository.read(projectId);
      if (active || closing || !batch || value.batchId !== batch.id || value.confirm !== true
        || batch.items.some(item => item.stage !== 'pending' || item.issueNumber !== null)) throw new PublicationError('Only a batch with no created or uncertain Issue can be cancelled.');
      transaction(() => repository.abandon(batch.id));
      messages.set(projectId, 'Publication cancelled before any Issue was created. Local tasks remain; edit and preview again when ready.');
      return state(projectId);
    },
    async close() { closing = true; if (active) await active.promise; },
  };
}
