export interface GitHubRepository { id: number; fullName: string; private: boolean }
export function isGitHubPullUrl(value: string): boolean {
  return /^https:\/\/github\.com\/[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9_.-]{1,100}\/pull\/[1-9][0-9]*$/.test(value)
    && !/^https:\/\/github\.com\/[^/]+\/\.{1,2}\//.test(value);
}
export function isGitHubIssueUrl(value: string): boolean {
  return /^https:\/\/github\.com\/[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9_.-]{1,100}\/issues\/[1-9][0-9]*$/.test(value)
    && !/^https:\/\/github\.com\/[^/]+\/\.{1,2}\//.test(value);
}
export interface GitHubStatus {
  available: boolean; connected: boolean; account: string | null; clientId: string;
  repository: GitHubRepository | null; preview: GitHubRepository | null;
  repositories: GitHubRepository[]; userCode: string | null; nextPollAt: number; message: string;
}
export function repositoryName(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9_.-]{1,100}$/.test(value)
    || ['.', '..'].includes(value.split('/')[1]!)) throw new Error('Enter a repository as owner/name.');
  return value;
}
export function parseGitHubRepository(value: unknown): GitHubRepository {
  if (!value || typeof value !== 'object') throw new Error('Could not read repository details.');
  const item = value as Record<string, unknown>;
  if (typeof item.id !== 'number' || !Number.isSafeInteger(item.id) || item.id < 1 || typeof item.private !== 'boolean') {
    throw new Error('Could not read repository details.');
  }
  return { id: item.id, fullName: repositoryName(item.fullName), private: item.private };
}
export function parseGitHubStatus(value: unknown): GitHubStatus {
  if (!value || typeof value !== 'object') throw new Error('Could not read GitHub connection.');
  const item = value as Record<string, unknown>;
  if (typeof item.available !== 'boolean' || typeof item.connected !== 'boolean'
    || (item.account !== null && typeof item.account !== 'string') || typeof item.clientId !== 'string'
    || typeof item.message !== 'string' || typeof item.nextPollAt !== 'number' || !Number.isFinite(item.nextPollAt)
    || (item.userCode !== null && (typeof item.userCode !== 'string' || !/^[A-Z0-9-]{4,20}$/.test(item.userCode)))
    || !Array.isArray(item.repositories)) throw new Error('Could not read GitHub connection.');
  return { available: item.available, connected: item.connected, account: item.account as string | null,
    clientId: item.clientId, message: item.message, nextPollAt: item.nextPollAt, userCode: item.userCode as string | null,
    repository: item.repository === null ? null : parseGitHubRepository(item.repository),
    preview: item.preview === null ? null : parseGitHubRepository(item.preview),
    repositories: item.repositories.map(parseGitHubRepository) };
}
export const unavailableGitHub: GitHubStatus = { available: false, connected: false, account: null, clientId: '',
  repository: null, preview: null, repositories: [], userCode: null, nextPollAt: 0,
  message: 'GitHub connection requires the Windows desktop app and OS-protected credential storage. Manual projects remain available.' };
