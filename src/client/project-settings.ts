import type { ProjectSettings, RepositoryContext } from '../shared/project-settings.ts';

export async function repositoryContext(id: string): Promise<RepositoryContext> {
  const response = await fetch('/api/projects/' + id + '/context/references');
  const result = await response.json() as RepositoryContext & { error?: string };
  if (!response.ok || !Array.isArray(result.files)) throw new Error(result.error ?? 'Could not read repository references.');
  return result;
}

export async function projectSettings(id: string, input?: ProjectSettings): Promise<ProjectSettings> {
  const response = await fetch('/api/projects/' + id + '/settings', input ? {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
  } : {});
  const result = await response.json() as ProjectSettings & { error?: string };
  if (!response.ok || !Number.isInteger(result.revision)) throw new Error(result.error ?? 'Could not read project settings.');
  return result;
}
