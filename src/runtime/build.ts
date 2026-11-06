import { readFileSync } from 'node:fs';
import { parseBuildInfo } from '../shared/build.ts';
import { SCHEMA_VERSION } from '../database/schema.ts';
export function readBuildInfo(path = new URL('../build-info.json', import.meta.url)) {
  try { return parseBuildInfo(JSON.parse(readFileSync(path, 'utf8'))); }
  catch { return { version: 'development', commit: 'unknown', schema: SCHEMA_VERSION, dirty: true }; }
}
