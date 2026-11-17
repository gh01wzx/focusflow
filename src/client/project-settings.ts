import type { ProjectSettings } from '../shared/project-settings.ts';

export async function projectSettings(id: string, input?: ProjectSettings): Promise<ProjectSettings> {
  const response = await fetch('/api/projects/' + id + '/settings', input ? {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
  } : {});
  const result = await response.json() as ProjectSettings & { error?: string };
  if (!response.ok || !Number.isInteger(result.revision)) throw new Error(result.error ?? 'Could not read project settings.');
  return result;
}
