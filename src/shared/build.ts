export interface BuildInfo { version: string; commit: string; tree: string; dirty: boolean; schemaVersion: number; node: string; electron: string | null; profile: 'sample' | 'everyday' }
export function parseBuildInfo(value: unknown): BuildInfo {
  const v = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const revision = (value: unknown) => typeof value === 'string' && (/^[a-f0-9]{40}$/.test(value) || value === 'unknown');
  if (typeof v.version !== 'string' || !/^(?:unknown|[0-9]+\.[0-9]+\.[0-9]+(?:-[A-Za-z0-9.-]+)?)$/.test(v.version)
    || !revision(v.commit) || !revision(v.tree) || typeof v.dirty !== 'boolean' || !Number.isSafeInteger(v.schemaVersion) || Number(v.schemaVersion) < 1
    || typeof v.node !== 'string' || !/^[0-9.]+$/.test(v.node) || !(v.electron === null || typeof v.electron === 'string' && /^[0-9.]+$/.test(v.electron))
    || !['sample','everyday'].includes(String(v.profile))) throw new Error('Build information is unavailable.');
  return { version: v.version, commit: v.commit as string, tree: v.tree as string, dirty: v.dirty, schemaVersion: v.schemaVersion as number,
    node: v.node, electron: v.electron as string | null, profile: v.profile as 'sample' | 'everyday' };
}
