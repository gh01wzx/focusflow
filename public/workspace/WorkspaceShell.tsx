import type { ReactNode } from 'react';
import { AiPanel } from './AiPanel.tsx';

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
        <a className="brand" href="/" aria-label="FocusFlow home">
          <span className="brand-mark">f<span>.</span></span>FocusFlow
        </a>
        <div className="workspace-label">YOUR WORKSPACE</div>
        <nav className="workspace-nav" aria-label="Workspaces">
          <button aria-current={workspace === 'personal' ? 'page' : undefined}
            disabled={busy} onClick={() => onWorkspaceChange('personal')}>Personal</button>
          <button aria-current={workspace === 'projects' ? 'page' : undefined}
            disabled={busy} onClick={() => onWorkspaceChange('projects')}>Projects</button>
        </nav>
        <div className="space-title">
          <span className="avatar">P</span>{workspace === 'personal' ? 'Personal' : 'Projects'}
          <span className="local-pill">Local</span>
        </div>
        {navigation}
        <AiPanel disabled={busy} />
        <div className="sidebar-note"><span className="local-dot" />Saved on this computer</div>
      </aside>
      {children}
    </div>
  );
}
