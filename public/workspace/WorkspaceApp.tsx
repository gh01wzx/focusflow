import { useEffect, useState } from 'react';
import { interfaceSettings } from '../../src/client/interface.ts';
import { createTaskClient } from '../../src/client/tasks.ts';
import { reportInterfaceReady } from '../../src/client/build.ts';
import { defaultInterface, type InterfaceSettings } from '../../src/shared/interface.ts';
import { TodayApp } from '../today/TodayApp.tsx';
import { ProjectsApp } from '../projects/ProjectsApp.tsx';
import { InterfaceContext } from './interface-context.ts';
import type { Workspace } from './WorkspaceShell.tsx';
import { useReminders } from './useReminders.ts';

function apply(settings: InterfaceSettings) {
  document.documentElement.dataset.motion = settings.reducedMotion ? 'reduced' : 'system';
  document.documentElement.lang = settings.language;
  document.documentElement.dataset.size = settings.size;
}

export function WorkspaceApp() {
  const [settings, setSettings] = useState(defaultInterface);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [readError, setReadError] = useState(false);
  useReminders();
  useEffect(() => {
    let active = true;
    void interfaceSettings().then(value => {
      if (!active) return;
      apply(value);
      setSettings(value);
      setWorkspace(value.start);
      if (value.start === 'projects') void createTaskClient().read().then(() => reportInterfaceReady()).catch(() => {});
    }).catch(() => {
      if (active) { setReadError(true); setWorkspace('personal'); }
    });
    return () => { active = false; };
  }, []);
  async function reload() {
    const value = await interfaceSettings();
    apply(value);
    setSettings(value);
    setReadError(false);
    return value;
  }
  async function save(next: InterfaceSettings) {
    const value = await interfaceSettings(next);
    apply(value);
    setSettings(value);
  }
  return <InterfaceContext.Provider value={{settings, save, reload, readError}}>
    {workspace === 'personal' ? <TodayApp onWorkspaceChange={setWorkspace} /> :
      workspace === 'projects' ? <ProjectsApp onWorkspaceChange={setWorkspace} /> : null}
  </InterfaceContext.Provider>;
}
