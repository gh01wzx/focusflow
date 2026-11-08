import { useEffect, useState } from 'react';
import { readBuild } from '../../src/client/build.ts';
import type { BuildInfo } from '../../src/shared/build.ts';
import { ProjectDialog } from '../projects/components/ProjectDialog.tsx';

export function BuildInformation({ disabled }: { disabled: boolean }) {
  const [open, setOpen] = useState(false), [info, setInfo] = useState<BuildInfo | null>(null), [error, setError] = useState('');
  useEffect(() => {
    if (!open) return;
    let active = true; setError('');
    void readBuild().then(value => { if (active) setInfo(value); }).catch(() => { if (active) setError('Could not read build information.'); });
    return () => { active = false; };
  }, [open]);
  return <>
    <button id="build-information" className="text-button" disabled={disabled} onClick={() => setOpen(true)}>Build information</button>
    {open && <ProjectDialog title="Build information" locked={false} returnFocusId="build-information" onClose={() => setOpen(false)}>
      {error && <p className="error" role="alert">{error}</p>}
      {info ? <dl><dt>Version</dt><dd>{info.version}</dd><dt>Commit</dt><dd>{info.commit}</dd><dt>Source tree</dt><dd>{info.tree}</dd>
        <dt>Local source changes</dt><dd>{info.dirty ? 'Uncommitted or unknown changes - commit alone does not identify this build' : 'Clean source at the recorded commit'}</dd>
        <dt>Database format</dt><dd>{info.schemaVersion}</dd><dt>Data profile</dt><dd>{info.profile === 'sample' ? 'Separate sample data' : 'Everyday data'}</dd>
        <dt>Node</dt><dd>{info.node}</dd><dt>Electron</dt><dd>{info.electron ?? 'Browser server'}</dd></dl> : !error && <p>Reading build information.</p>}
      <p>Copy these version details when reporting a problem. Task content, credentials and local paths are excluded.</p>
    </ProjectDialog>}
  </>;
}
