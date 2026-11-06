export interface BuildInfo { version: string; commit: string; schema: number; dirty: boolean }
export function parseBuildInfo(value: unknown): BuildInfo {
  if (!value || typeof value !== 'object') throw new Error('Build information unavailable.');
  const item = value as Record<string, unknown>;
  if (typeof item.version !== 'string' || !/^[a-zA-Z0-9.+-]{1,80}$/.test(item.version)
    || typeof item.commit !== 'string' || !/^(?:[a-f0-9]{40}|unknown)$/.test(item.commit)
    || typeof item.schema !== 'number' || !Number.isSafeInteger(item.schema) || item.schema < 1 || typeof item.dirty !== 'boolean') {
    throw new Error('Build information unavailable.');
  }
  return { version: item.version, commit: item.commit, schema: item.schema, dirty: item.dirty };
}
