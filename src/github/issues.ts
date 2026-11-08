import type { GitHubRepository } from '../shared/github.ts';
import type { IssueProvider, RemoteIssue } from '../publication/service.ts';
import { IssueCreationRefused } from '../shared/publication.ts';
import type { LinkedWorkProvider } from '../sync/service.ts';
import { parseLinkedIssue, parseLinkedPull } from '../shared/linked-work.ts';

export type RepositoryRequest = <T>(projectId: string, expected: GitHubRepository | null,
  operation: (repository: GitHubRepository, request: (suffix: string, method?: string, body?: unknown) => Promise<unknown>) => Promise<T>) => Promise<T>;
export function parseRemoteIssue(value: unknown): RemoteIssue {
  const item = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  if (!Number.isSafeInteger(item.number) || Number(item.number) < 1 || typeof item.title !== 'string' || item.title.length > 1000
    || !(item.body === null || typeof item.body === 'string' && item.body.length <= 1000000) || item.pull_request) throw new Error('GitHub Issue response is invalid.');
  return { number: item.number as number, title: item.title, body: item.body as string | null ?? '' };
}
export function createIssueProvider(run: RepositoryRequest): IssueProvider & LinkedWorkProvider {
  return {
    read: (projectId, repository, number) => run(projectId, repository, async (_repository, request) => {
      if (!Number.isSafeInteger(number) || number < 1) throw new Error('Invalid Issue number.');
      const result = await request('/issues/' + number);
      const value = result && typeof result === 'object' ? result as Record<string, unknown> : {};
      if (value.pull_request) throw new Error('Expected an Issue, not a pull request.');
      const issue = parseLinkedIssue({ ...parseRemoteIssue(value), state: value.state, updatedAt: value.updated_at });
      if (issue.number !== number) throw new Error('Issue identity changed.');
      return issue;
    }),
    pull: (projectId, repository, number) => run(projectId, repository, async (_repository, request) => {
      if (!Number.isSafeInteger(number) || number < 1) throw new Error('Invalid pull request number.');
      const result = await request('/pulls/' + number);
      const value = result && typeof result === 'object' ? result as Record<string, unknown> : {};
      const head = value.head && typeof value.head === 'object' ? value.head as Record<string, unknown> : {};
      const pull = parseLinkedPull({ number: value.number, title: value.title, body: value.body ?? '', state: value.state, updatedAt: value.updated_at,
        headSha: head.sha, merged: value.merged, mergeCommitSha: value.merge_commit_sha });
      if (pull.number !== number) throw new Error('Pull request identity changed.');
      return pull;
    }),
    inspect: projectId => run(projectId, null, async repository => repository),
    find: (projectId, repository, marker) => run(projectId, repository, async (_repository, request) => {
      const matches: RemoteIssue[] = [];
      for (let page = 1; page <= 20; page++) {
        const result = await request('/issues?state=all&per_page=100&page=' + page);
        if (!Array.isArray(result)) throw new Error('Could not read Issue identities.');
        for (const value of result) {
          if (value && typeof value === 'object' && 'pull_request' in value) continue;
          const issue = parseRemoteIssue(value);
          if (issue.body.includes(marker)) matches.push(issue);
        }
        if (result.length < 100) return matches;
      }
      throw new Error('Repository has too many Issues for bounded reconciliation. Inspect it manually.');
    }),
    create: (projectId, repository, title, body) => run(projectId, repository, async (_repository, request) => {
      let response: unknown;
      try { response = await request('/issues', 'POST', { title, body }); }
      catch (error) {
        if (error && typeof error === 'object' && 'refused' in error && error.refused === true) throw new IssueCreationRefused('GitHub refused creation; no Issue was created.');
        throw error;
      }
      const issue = parseRemoteIssue(response);
      if (issue.title !== title || issue.body !== body) throw new Error('GitHub did not confirm the approved Issue content.');
      return issue;
    }),
    update: (projectId, repository, number, title, body) => run(projectId, repository, async (_repository, request) => {
      if (!Number.isSafeInteger(number) || number < 1) throw new Error('Invalid Issue number.');
      const result = parseRemoteIssue(await request('/issues/' + number, 'PATCH', { title, body }));
      if (result.number !== number || result.title !== title || result.body !== body) throw new Error('GitHub did not confirm the requested Issue update.');
      return result;
    }),
  };
}
