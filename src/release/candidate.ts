import { createReadStream } from 'node:fs';
import { lstat, readFile, realpath, rename, writeFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { join } from 'node:path';

export const CANDIDATE_COMMANDS = ['npm run check:language','npm run typecheck','npm run package:windows','npm test'] as const;
export const INSTALLED_SCENARIOS = ['today','review','product-recovery','manual-project'] as const;
export interface CandidateManifest {
  format: 'focusflow-candidate-1'; version: string; commit: string; tree: string; schemaVersion: number;
  installer: { fileName: string; bytes: number; sha256: string };
  commands: string[]; installed: 'not-verified' | 'verified-ci'; reports: { scenario: string; sha256: string }[];
  trust: 'not-verified-for-official-release'; publication: 'owner-action-required';
}
export class CandidateError extends Error {}
export function parseCandidate(value: unknown): CandidateManifest {
  const item = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const artifact = item.installer && typeof item.installer === 'object' ? item.installer as Record<string, unknown> : {};
  const reports = Array.isArray(item.reports) ? item.reports as Record<string, unknown>[] : [];
  if (item.format !== 'focusflow-candidate-1' || typeof item.version !== 'string' || !/^[0-9]+\.[0-9]+\.[0-9]+(?:-[A-Za-z0-9.-]+)?$/.test(item.version)
    || typeof item.commit !== 'string' || !/^[a-f0-9]{40}$/.test(item.commit) || typeof item.tree !== 'string' || !/^[a-f0-9]{40}$/.test(item.tree)
    || !Number.isSafeInteger(item.schemaVersion) || Number(item.schemaVersion) < 1
    || artifact.fileName !== 'FocusFlow-' + item.version + '-x64.exe' || !Number.isSafeInteger(artifact.bytes) || Number(artifact.bytes) < 1
    || typeof artifact.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(artifact.sha256)
    || JSON.stringify(item.commands) !== JSON.stringify(CANDIDATE_COMMANDS) || !['not-verified','verified-ci'].includes(String(item.installed))
    || item.trust !== 'not-verified-for-official-release' || item.publication !== 'owner-action-required' || !Array.isArray(item.reports)
    || reports.some(report => !report || !INSTALLED_SCENARIOS.includes(report.scenario as typeof INSTALLED_SCENARIOS[number]) || typeof report.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(report.sha256))
    || item.installed === 'verified-ci' && (reports.length !== INSTALLED_SCENARIOS.length || new Set(reports.map(report => report.scenario)).size !== reports.length)
    || item.installed === 'not-verified' && reports.length !== 0) throw new CandidateError('Candidate metadata is invalid or incomplete.');
  return { format: item.format, version: item.version, commit: item.commit, tree: item.tree, schemaVersion: item.schemaVersion as number,
    installer: { fileName: artifact.fileName as string, bytes: artifact.bytes as number, sha256: artifact.sha256 },
    commands: [...CANDIDATE_COMMANDS], installed: item.installed as CandidateManifest['installed'],
    reports: reports.map(report => ({ scenario: report.scenario as string, sha256: report.sha256 as string })), trust: item.trust, publication: item.publication };
}
async function digestArtifact(root: string, name: string) {
  const path = join(root, name), before = await lstat(path);
  if (!before.isFile() || before.isSymbolicLink()) throw new CandidateError('Use a regular installer file inside the candidate directory.');
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  const after = await lstat(path);
  if (before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ino !== after.ino) throw new CandidateError('Installer changed during verification. Rebuild before continuing.');
  return { bytes: after.size, sha256: hash.digest('hex') };
}
export async function collectInstalledEvidence(artifacts: string, commit: string) {
  const reports = [];
  for (const scenario of INSTALLED_SCENARIOS) {
    const path = join(artifacts, scenario, 'report.json');
    if ((await lstat(path)).size > 65536) throw new CandidateError('Installed check report is too large.');
    const raw = await readFile(path), value = JSON.parse(raw.toString('utf8')) as Record<string, unknown>;
    if (value.status !== 'verified' || value.commit !== commit) throw new CandidateError('Installed evidence is missing, failed or belongs to another commit.');
    reports.push({ scenario, sha256: createHash('sha256').update(raw).digest('hex') });
  }
  return reports;
}
export async function writeCandidate(directory: string, input: Omit<CandidateManifest, 'installer' | 'format' | 'trust' | 'publication'>) {
  const root = await realpath(directory), fileName = 'FocusFlow-' + input.version + '-x64.exe';
  parseCandidate({ ...input, format: 'focusflow-candidate-1', installer: { fileName, bytes: 1, sha256: '0'.repeat(64) },
    trust: 'not-verified-for-official-release', publication: 'owner-action-required' });
  const manifest = parseCandidate({ ...input, format: 'focusflow-candidate-1', installer: { fileName, ...await digestArtifact(root, fileName) },
    trust: 'not-verified-for-official-release', publication: 'owner-action-required' });
  const temporary = join(root, 'candidate-' + randomUUID() + '.json');
  await writeFile(temporary, JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
  await rename(temporary, join(root, 'candidate.json'));
  return manifest;
}
export async function verifyCandidate(directory: string) {
  const root = await realpath(directory), path = join(root, 'candidate.json');
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink() || info.size > 65536) throw new CandidateError('Use a bounded regular candidate manifest.');
  const manifest = parseCandidate(JSON.parse(await readFile(path, 'utf8')));
  const actual = await digestArtifact(root, manifest.installer.fileName);
  if (actual.sha256 !== manifest.installer.sha256 || actual.bytes !== manifest.installer.bytes) throw new CandidateError('Installer integrity does not match this candidate. Do not publish or install it.');
  return manifest;
}
