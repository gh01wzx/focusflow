import { t } from './locale.ts';
import type { ReactNode } from 'react';
import { AiPanel } from './AiPanel.tsx';
import { SettingsPanel } from './SettingsPanel.tsx';

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
        <button type="button" className="brand" aria-label={t("FocusFlow home")} disabled={busy}
          onClick={() => onWorkspaceChange('personal')}>
          <span className="brand-mark" aria-hidden="true">f<span>.</span></span>FocusFlow
        </button>
        <nav className="workspace-nav" aria-label={t("Workspaces")}>
          <button aria-current={workspace === 'personal' ? 'page' : undefined}
            disabled={busy} onClick={() => onWorkspaceChange('personal')}>{t("Personal")}</button>
          <button aria-current={workspace === 'projects' ? 'page' : undefined}
            disabled={busy} onClick={() => onWorkspaceChange('projects')}>{t("Projects")}</button>
        </nav>
        {navigation}
        <div className="workspace-settings">
          <AiPanel disabled={busy} />
          <SettingsPanel disabled={busy} />
        </div>
      </aside>
      {children}
    </div>
  );
}
