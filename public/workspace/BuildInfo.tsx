import { useEffect, useState } from 'react';
import { parseBuildInfo } from '../../src/shared/build.ts';
import type { BuildInfo as Build } from '../../src/shared/build.ts';
export function BuildInfo() {
  const [build, setBuild] = useState<Build | null>(null);
  useEffect(() => {
    let mounted = true;
    void fetch('/api/build').then(response => response.json()).then(parseBuildInfo)
      .then(value => { if (mounted) setBuild(value); }).catch(() => {});
    return () => { mounted = false; };
  }, []);
  return build && <details className="build-info">
    <summary>Build information</summary>
    <p>Version {build.version}</p><p>Commit {build.commit}</p>
    <p>Data format {build.schema}{build.dirty ? ' / local changes' : ''}</p>
  </details>;
}
