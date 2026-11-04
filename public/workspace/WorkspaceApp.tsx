import { useState } from 'react';
import { TodayApp } from '../today/TodayApp.tsx';
import { ProjectsApp } from '../projects/ProjectsApp.tsx';
import type { Workspace } from './WorkspaceShell.tsx';

export function WorkspaceApp() {
  const [workspace, setWorkspace] = useState<Workspace>('personal');
  return workspace === 'personal'
    ? <TodayApp onWorkspaceChange={setWorkspace} />
    : <ProjectsApp onWorkspaceChange={setWorkspace} />;
}
