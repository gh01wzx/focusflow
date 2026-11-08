import { createHash } from 'node:crypto';
import type { GitHubRepository } from '../shared/github.ts';
import type { LinkedIssue, LinkedPull, LinkedWorkState } from '../shared/linked-work.ts';
import { issueFields } from '../shared/linked-work.ts';
import type { ProjectRepository } from '../projects/repository.ts';
import type { ProjectTransaction } from '../projects/service.ts';
import { ticketDetailsInput } from '../projects/validation.ts';
import type { LinkedWorkRepository } from './repository.ts';

export interface LinkedWorkProvider {
  read(projectId: string, repository: GitHubRepository, number: number): Promise<LinkedIssue>;
  pull(projectId: string, repository: GitHubRepository, number: number): Promise<LinkedPull>;
}
export class LinkedWorkError extends Error {}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' ? value as Record<string, unknown> : {};
export function createLinkedWorkService(repository: LinkedWorkRepository, projects: ProjectRepository, transaction: ProjectTransaction, provider?: LinkedWorkProvider) {
  const generations = new Map<string, number>();
  const invalidate = (id: string) => { const next = (generations.get(id) ?? 0) + 1; generations.set(id, next); return next; };
  function linked(id: string) {
    const ticket = projects.findTicket(id);
    if (!ticket || ticket.executionMode !== 'codex' || !ticket.coding?.repository || !ticket.coding.issueNumber) throw new LinkedWorkError('Choose a published coding ticket. Manual work has no GitHub sync.');
    return { ticket, repository: ticket.coding.repository, number: ticket.coding.issueNumber };
  }
  function state(id: string): LinkedWorkState {
    const link = linked(id), saved = repository.read(id);
    const local = { title: link.ticket.title, description: link.ticket.description, acceptanceCriteria: link.ticket.acceptanceCriteria };
    const remoteFields = saved.remote ? issueFields(saved.remote, id) : null;
    return { ticketId: id, repository: link.repository, issueNumber: link.number, local, remote: saved.remote,
      pull: saved.pull, pullNumber: saved.pullNumber, lastSuccess: saved.lastSuccess, error: saved.error,
      token: hash({ local, remote: saved.remote, pull: saved.pull, pullNumber: saved.pullNumber, repository: link.repository, issue: link.number }),
      localChanged: saved.baseline ? !same(local, saved.baseline) : null,
      remoteChanged: saved.baseline && remoteFields ? !same(remoteFields, saved.baseline) : null,
      matches: !!remoteFields && same(local, remoteFields), remoteFields };
  }
  function consent(id: string, input: unknown) {
    const value = record(input);
    if (value.confirm !== true || value.token !== state(id).token) throw new LinkedWorkError('Refresh this ticket and explicitly confirm the current comparison first.');
    return value;
  }
  return {
    state,
    async refresh(id: string) {
      const generation = invalidate(id);
      const link = linked(id), saved = repository.read(id);
      if (!provider) throw new LinkedWorkError('Linked work needs the Windows GitHub connection.');
      try {
        const remote = await provider.read(link.ticket.projectId, link.repository, link.number);
        const pull = saved.pullNumber ? await provider.pull(link.ticket.projectId, link.repository, saved.pullNumber) : null;
        if (generation !== generations.get(id)) return state(id);
        if (remote.number !== link.number || pull && pull.number !== saved.pullNumber) throw new Error('Identity mismatch');
        transaction(now => {
          repository.refresh(id, remote, pull, now.toISOString());
          const fields = issueFields(remote, id), current = state(id);
          if (!saved.baseline && fields && same(current.local, fields)) repository.baseline(id, fields);
        });
      } catch {
        if (generation !== generations.get(id)) return state(id);
        transaction(() => repository.error(id, 'GitHub could not refresh this identity. Check sign-in, repository access, network or rate limits. Previous successful evidence is retained.'));
      }
      return state(id);
    },
    edit(id: string, input: unknown) {
      const value = consent(id, input), source = record(value.fields);
      const fields = ticketDetailsInput({ title: source.title, description: source.description, acceptanceCriteria: source.acceptanceCriteria });
      transaction(now => { consent(id, input); invalidate(id); projects.editTicket(id, fields, now.toISOString()); });
      return state(id);
    },
    async acceptRemote(id: string, input: unknown) {
      consent(id, input); const before = state(id), link = linked(id);
      if (!provider || !before.remote) throw new LinkedWorkError('Refresh the GitHub Issue before accepting its fields.');
      let remote: LinkedIssue;
      try { remote = await provider.read(link.ticket.projectId, link.repository, link.number); }
      catch { throw new LinkedWorkError('Could not recheck GitHub. Your local fields are unchanged.'); }
      if (!same(remote, before.remote)) throw new LinkedWorkError('GitHub changed after the comparison. Refresh before choosing its fields.');
      const fields = issueFields(remote, id);
      if (!fields) throw new LinkedWorkError('This Issue does not use the recognized FocusFlow fields. Keep local text or correct the Issue on GitHub first.');
      transaction(now => { consent(id, input); invalidate(id); projects.editTicket(id, fields, now.toISOString()); repository.baseline(id, fields); });
      return state(id);
    },
    async linkPull(id: string, input: unknown) {
      const value = consent(id, input), link = linked(id), saved = repository.read(id);
      if (!provider || !Number.isSafeInteger(value.number) || Number(value.number) < 1) throw new LinkedWorkError('Enter a pull request number from this repository.');
      if (saved.pullNumber && saved.pullNumber !== value.number) throw new LinkedWorkError('This ticket already has a linked pull request. Its identity cannot be replaced silently.');
      let pull: LinkedPull;
      try { pull = await provider.pull(link.ticket.projectId, link.repository, value.number as number); }
      catch { throw new LinkedWorkError('Could not inspect this pull request. Keep the existing identity and check GitHub access.'); }
      if (pull.number !== value.number || !new RegExp('(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\\s+(?:#' + link.number + '\\b|https://github\\.com/' + link.repository.fullName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '/issues/' + link.number + '\\b)', 'i').test(pull.body)) {
        throw new LinkedWorkError('The pull request must explicitly close this Issue in the same repository.');
      }
      transaction(() => { consent(id, input); invalidate(id); repository.linkPull(id, pull); });
      return state(id);
    },
  };
}
