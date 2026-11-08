import { parseBuildInfo } from '../shared/build.ts';
export async function readBuild(transport: typeof fetch = fetch) {
  const response = await transport('/api/build');
  if (!response.ok) throw new Error('Could not read build information.');
  return parseBuildInfo(await response.json());
}
export async function reportInterfaceReady(transport: typeof fetch = fetch) {
  const response = await transport('/api/runtime/ready', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"ready":true}' });
  if (!response.ok) throw new Error('Interface readiness could not be confirmed.');
}
