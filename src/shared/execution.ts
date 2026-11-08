import type { GitHubRepository } from './github.ts';
import { parseGitHubRepository } from './github.ts';

export interface RepositoryInspection {
  sourcePath: string; headSha: string; branch: string; dirty: boolean;
  remote: string; repository: GitHubRepository; notice: string;
}
export interface CodingWorkspace {
  ticketId: string; sourcePath: string; workspacePath: string; branch: string;
  baseSha: string; repository: GitHubRepository; state: 'preparing' | 'ready' | 'failed';
  message: string;
}
export interface WorkspaceState { ticketId: string; workspace: CodingWorkspace | null; inspection: RepositoryInspection | null }
export function parseWorkspaceState(value: unknown, ticketId: string): WorkspaceState {
  const source = executionRecord(value);
  if (source.ticketId !== ticketId) throw new Error('Repository data belongs to another ticket.');
  let workspace: CodingWorkspace | null = null;
  if (source.workspace !== null) {
    const w = executionRecord(source.workspace);
    if (w.ticketId !== ticketId || !['preparing','ready','failed'].includes(String(w.state)) || typeof w.baseSha !== 'string' || !/^[a-f0-9]{40}$/.test(w.baseSha)) throw new Error('Invalid coding workspace.');
    workspace = { ticketId, sourcePath: executionText(w.sourcePath,2000,'Invalid source folder.'), workspacePath: executionText(w.workspacePath,2000,'Invalid workspace.'),
      branch: executionText(w.branch,100,'Invalid branch.'), baseSha: w.baseSha, repository: parseGitHubRepository(w.repository),
      state: w.state as CodingWorkspace['state'], message: typeof w.message === 'string' ? w.message.slice(0,1000) : '' };
  }
  let inspection: RepositoryInspection | null = null;
  if (source.inspection !== null) {
    const i = executionRecord(source.inspection);
    if (typeof i.headSha !== 'string' || !/^[a-f0-9]{40}$/.test(i.headSha) || typeof i.dirty !== 'boolean' || typeof i.branch !== 'string' || typeof i.notice !== 'string') throw new Error('Invalid repository inspection.');
    inspection = { sourcePath: executionText(i.sourcePath,2000,'Invalid source folder.'), headSha: i.headSha, branch: i.branch,
      dirty: i.dirty, remote: executionText(i.remote,200,'Invalid remote.'), repository: parseGitHubRepository(i.repository), notice: i.notice.slice(0,1000) };
  }
  return { ticketId, workspace, inspection };
}
export function executionRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
export function executionText(value: unknown, limit: number, label: string): string {
  if (typeof value !== 'string' || !value.trim() || value.length > limit || value.includes('\0')) throw new Error(label);
  return value.trim();
}
