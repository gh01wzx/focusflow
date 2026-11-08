import { mkdir, realpath, stat } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import type { CodingWorkspace, RepositoryInspection } from '../shared/execution.ts';
import { executionRecord, executionText } from '../shared/execution.ts';
import type { ProjectRepository } from '../projects/repository.ts';
import type { ProjectTicket } from '../shared/projects.ts';
import type { GitHubRepository } from '../shared/github.ts';
import type { ExecutionRepository } from './repository.ts';
import { git, ExecutionFailure } from './git.ts';

export function createWorkspaceService(repository: ExecutionRepository, projects: ProjectRepository, root: string) {
  const pending = new Set<string>();
  const shutdown = new AbortController();
  const runGit = (cwd: string, args: string[]) => git(cwd, args, shutdown.signal);
  function ticket(id: string) {
    const value = projects.findTicket(id);
    if (!value?.coding?.repository || !value.coding.issueNumber || value.executionMode !== 'codex') {
      throw new ExecutionFailure('NOT_PUBLISHED', 'Publish this coding ticket and connect its repository first.');
    }
    return value as ProjectTicket & { coding: { repository: GitHubRepository; issueNumber: number } };
  }
  async function inspect(id: string, input: unknown): Promise<RepositoryInspection> {
    const value = ticket(id), fields = executionRecord(input);
    const entered = executionText(fields.sourcePath, 2000, 'Enter the absolute path of a local Git repository.');
    if (!isAbsolute(entered)) throw new ExecutionFailure('ABSOLUTE_PATH_REQUIRED', 'Choose an absolute local folder path.');
    const sourcePath = await realpath(entered).catch(() => { throw new ExecutionFailure('MISSING_FOLDER', 'The local repository folder is unavailable.'); });
    const top = await realpath(await runGit(sourcePath, ['rev-parse', '--show-toplevel']));
    if (top.toLowerCase() !== sourcePath.toLowerCase()) throw new ExecutionFailure('NOT_REPOSITORY_ROOT', 'Choose the repository root, not a subfolder.');
    const remoteUrl = await runGit(sourcePath, ['remote', 'get-url', 'origin']);
    const match = /^(?:https:\/\/github\.com\/|git@github\.com:)([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+?)(?:\.git)?\/?$/.exec(remoteUrl);
    if (!match || match[1]!.toLowerCase() !== value.coding.repository.fullName.toLowerCase()) {
      throw new ExecutionFailure('REMOTE_MISMATCH', 'The origin remote must match this ticket\'s connected GitHub repository.');
    }
    const headSha = await runGit(sourcePath, ['rev-parse', '--verify', 'HEAD']);
    if (!/^[a-f0-9]{40}$/.test(headSha)) throw new ExecutionFailure('MISSING_BASE', 'Commit a base revision before preparing coding work.');
    const branch = await runGit(sourcePath, ['branch', '--show-current']);
    const dirty = !!await runGit(sourcePath, ['status', '--porcelain=v1', '--untracked-files=normal']);
    return { sourcePath, headSha, branch, dirty, remote: match[1]!, repository: value.coding.repository,
      notice: dirty ? 'Your uncommitted files stay in the original folder. The coding workspace starts from the displayed committed revision and excludes those edits.'
        : 'The original folder is retained. Coding uses a separate worktree at the displayed commit.' };
  }
  async function prepare(id: string, input: unknown): Promise<CodingWorkspace> {
    if (pending.has(id)) throw new ExecutionFailure('BUSY', 'Repository preparation is already running.');
    pending.add(id);
    try {
      const fields = executionRecord(input);
      if (fields.confirm !== true) throw new ExecutionFailure('CONFIRM_REQUIRED', 'Inspect the local repository, then confirm preparation.');
      const checked = await inspect(id, input), value = ticket(id);
      if (fields.headSha !== checked.headSha) throw new ExecutionFailure('STALE_BASE', 'The base commit changed. Inspect it again before preparing.');
      const saved = repository.workspace(id);
      if (saved && (saved.sourcePath !== checked.sourcePath || saved.baseSha !== checked.headSha)) {
        throw new ExecutionFailure('EXISTING_WORKSPACE', 'This ticket already owns a workspace. Its source and base cannot be silently replaced.');
      }
      await mkdir(root, { recursive: true });
      const ownedRoot = await realpath(root), workspacePath = join(ownedRoot, id);
      if (!/^[a-f0-9-]{36}$/.test(id) || relative(ownedRoot, resolve(workspacePath)) !== id) throw new ExecutionFailure('INVALID_WORKSPACE', 'Workspace identity is invalid.');
      const branch = saved?.branch ?? String(value.coding.issueNumber) + '-' + (value.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0,48) || 'coding-task');
      const workspace: CodingWorkspace = saved ?? { ticketId: id, sourcePath: checked.sourcePath, workspacePath,
        branch, baseSha: checked.headSha, repository: checked.repository, state: 'preparing', message: '' };
      repository.saveWorkspace({ ...workspace, state: 'preparing', message: 'Preparing an isolated worktree.' });
      try {
        const exists = await stat(workspacePath).then(() => true, () => false);
        if (exists && !saved) throw new ExecutionFailure('UNKNOWN_FOLDER', 'A folder already occupies this workspace path. It was left untouched.');
        if (!exists) await runGit(checked.sourcePath, ['worktree', 'add', '-b', branch, workspacePath, checked.headSha]);
        const actual = await realpath(await runGit(workspacePath, ['rev-parse', '--show-toplevel']));
        const sourceCommon=await realpath(await runGit(checked.sourcePath,['rev-parse','--path-format=absolute','--git-common-dir']));
        const worktreeCommon=await realpath(await runGit(workspacePath,['rev-parse','--path-format=absolute','--git-common-dir']));
        if (actual.toLowerCase() !== workspacePath.toLowerCase() || sourceCommon.toLowerCase()!==worktreeCommon.toLowerCase() || await runGit(workspacePath, ['branch', '--show-current']) !== branch) {
          throw new ExecutionFailure('WORKSPACE_CHANGED', 'The existing folder is not this ticket\'s worktree. It was left untouched.');
        }
        const result: CodingWorkspace = { ...workspace, state: 'ready', message: 'Workspace ready. No model or coding run has started.' };
        repository.saveWorkspace(result); return result;
      } catch (error) {
        repository.saveWorkspace({ ...workspace, state: 'failed', message: 'Preparation stopped. Existing folders and source edits were retained.' });
        throw error;
      }
    } finally { pending.delete(id); }
  }
  return { inspect, prepare, close() { shutdown.abort(); }, read(id: string) { ticket(id); return repository.workspace(id); } };
}
