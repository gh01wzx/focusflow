import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import type { AiProviders } from '../ai/providers.ts';
import type { AiModelSelection } from '../shared/ai.ts';
import { ExecutionFailure, git } from './git.ts';

export function patchFiles(value: unknown) {
  if (typeof value !== 'string' || value.length > 6000) return [];
  const paths = [...new Set(value.split(/\r?\n/).map(line => line.trim()).filter(Boolean))];
  if (paths.length > 8 || paths.some(path => !/^[A-Za-z0-9_./-]+$/.test(path)
    || path.startsWith('/') || path.split('/').some(part => !part || part === '..' || part.startsWith('.'))
    || /(?:secret|credential|\.env|\.pem|\.key|\.lock|\.db|\.sqlite|id_rsa)/i.test(path))) {
    throw new ExecutionFailure('FILE_SCOPE', 'Enter up to eight ordinary tracked source paths, one per line.');
  }
  return paths;
}

export async function applyProviderPatch(ai: AiProviders, selection: AiModelSelection, cwd: string,
  prompt: string, paths: string[], signal: AbortSignal) {
  const root = await realpath(cwd);
  const sources: Array<{ path: string; content: string }> = [];
  let size = 0;
  for (const path of paths) {
    const tracked = await git(cwd, ['ls-files', '--error-unmatch', '--', path], signal);
    const absolute = await realpath(join(cwd, path));
    if (tracked !== path || relative(root, absolute).replaceAll('\\', '/') !== path) {
      throw new ExecutionFailure('FILE_SCOPE', 'Each source path must be an ordinary tracked file in this worktree.');
    }
    const content = await readFile(absolute, { encoding: 'utf8', signal });
    size += content.length;
    if (size > 32000 || content.includes('\u0000')) throw new ExecutionFailure('FILE_SCOPE', 'Select a smaller set of text files.');
    sources.push({ path, content });
  }
  const patch = await ai.respond(selection, prompt + '\n\nReturn a valid Git unified diff only. Modify only the supplied files. No renames, deletions, mode changes, additions or code fences.\n' +
    JSON.stringify(sources), signal, () => {});
  if (!patch.startsWith('diff --git ') || patch.length > 60000 || /^(?:rename from|rename to|new file mode|deleted file mode|old mode|new mode|GIT binary patch|Binary files) /m.test(patch)) {
    throw new ExecutionFailure('PATCH_FORMAT', 'The model did not produce a usable source diff.');
  }
  for (const source of sources) {
    const current = await realpath(join(cwd, source.path));
    if (relative(root, current).replaceAll('\\', '/') !== source.path || await readFile(current, { encoding: 'utf8', signal }) !== source.content) {
      throw new ExecutionFailure('WORKSPACE_CHANGED', 'The selected source changed while the model was working. Review it before retrying.');
    }
  }
  const directory = await mkdtemp(join(tmpdir(), 'focusflow-patch-'));
  try {
    const file = join(directory, 'change.patch');
    await writeFile(file, patch.trimEnd() + '\n', { flag: 'wx', signal });
    const stats = await git(cwd, ['apply', '--numstat', '--', file], signal);
    const touched = stats.split(/\r?\n/).map(line => /^\d+\t\d+\t(.+)$/.exec(line)?.[1]);
    if (!touched.length || touched.some(path => !path || !paths.includes(path))) throw new ExecutionFailure('FILE_SCOPE', 'The proposed diff changes files outside the approved list.');
    await git(cwd, ['apply', '--check', '--', file], signal);
    signal.throwIfAborted();
    // Once the local write begins, let Git finish and retain any successful edits for review.
    await git(cwd, ['apply', '--', file]);
    return 'Applied a source diff to ' + [...new Set(touched)].join(', ') + '. Project checks were not run.';
  } finally { await rm(directory, { recursive: true, force: true }); }
}
