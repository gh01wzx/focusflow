import { readFile } from 'node:fs/promises';
import { parseBuildInfo } from '../shared/build.ts';
import { SCHEMA_VERSION } from '../database/schema.ts';

export async function readBuildInfo(sample: boolean, appVersion?: string) {
  let metadata: Record<string, unknown> = { version: 'unknown', commit: 'unknown', tree: 'unknown', dirty: true };
  try { metadata = JSON.parse(await readFile(new URL('./build-info.json', import.meta.url), 'utf8')) as Record<string, unknown>; } catch {}
  return parseBuildInfo({ ...metadata, ...(appVersion ? { version: appVersion } : {}), schemaVersion: SCHEMA_VERSION, node: process.versions.node,
    electron: process.versions.electron ?? null, profile: sample ? 'sample' : 'everyday' });
}
