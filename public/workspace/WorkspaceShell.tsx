import type { ReactNode } from 'react';
import { AiPanel } from './AiPanel.tsx';
import { BuildInformation } from './BuildInformation.tsx';

export type Workspace = 'personal' | 'projects';
export interface WorkspaceProps {
  onWorkspaceChange(value: Workspace): void;
}

interface ShellProps extends WorkspaceProps {
  workspace: Workspace;
  busy: boolean;
  navigation: ReactNode;
  children: ReactNode;
}

export function WorkspaceShell({ workspace, busy, navigation, children, onWorkspaceChange }: ShellProps) {
  return (
    <div className="shell">
      <aside className="sidebar">
        <button type="button" className="brand" aria-label="FocusFlow home" disabled={busy}
          onClick={() => onWorkspaceChange('personal')}>
          <span className="brand-mark" aria-hidden="true">f<span>.</span></span>FocusFlow
        </button>
        <nav className="workspace-nav" aria-label="Workspaces">
          <button aria-current={workspace === 'personal' ? 'page' : undefined}
            disabled={busy} onClick={() => onWorkspaceChange('personal')}>Personal</button>
          <button aria-current={workspace === 'projects' ? 'page' : undefined}
            disabled={busy} onClick={() => onWorkspaceChange('projects')}>Projects</button>
        </nav>
        {navigation}
        <details className="workspace-settings"><summary>Settings</summary>
          <AiPanel disabled={busy} />
          <BuildInformation disabled={busy} />
        </details>
      </aside>
      {children}
    </div>
  );
}
