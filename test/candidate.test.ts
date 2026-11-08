import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CANDIDATE_COMMANDS, INSTALLED_SCENARIOS, writeCandidate, verifyCandidate, parseCandidate, collectInstalledEvidence } from '../src/release/candidate.ts';

const metadata = () => ({ version: '0.1.0-test.1', commit: 'a'.repeat(40), tree: 'b'.repeat(40), schemaVersion: 12,
  commands: [...CANDIDATE_COMMANDS], installed: 'not-verified' as const, reports: [] });
test('candidate checksum binds the regular installer to its version and committed source; tampering refuses it', async t => {
  const root = await mkdtemp(join(tmpdir(), 'focusflow-candidate-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const path = join(root, 'FocusFlow-0.1.0-test.1-x64.exe');
  await writeFile(path, 'Synthetic installer bytes - never executed');
  const manifest = await writeCandidate(root, metadata());
  assert.deepEqual(await verifyCandidate(root), manifest);
  assert.equal(manifest.publication, 'owner-action-required'); assert.equal(manifest.trust, 'not-verified-for-official-release');
  assert.equal(manifest.installed, 'not-verified'); assert.equal(manifest.commit, 'a'.repeat(40));
  await writeFile(path, 'Changed installer bytes');
  await assert.rejects(verifyCandidate(root), /integrity/);
});
test('invalid identities, missing checks and path traversal cannot replace a previous candidate', async t => {
  const root = await mkdtemp(join(tmpdir(), 'focusflow-candidate-input-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, 'FocusFlow-0.1.0-test.1-x64.exe'), 'Synthetic bytes');
  await writeCandidate(root, metadata()); const before = await readFile(join(root, 'candidate.json'));
  await assert.rejects(writeCandidate(root, { ...metadata(), commit: 'unknown' }), /invalid/);
  await assert.rejects(writeCandidate(root, { ...metadata(), version: '../outside' }), /invalid/);
  await assert.rejects(writeCandidate(root, { ...metadata(), commands: ['npm test'] }), /invalid/);
  assert.deepEqual(await readFile(join(root, 'candidate.json')), before);
  const changed = JSON.parse(before.toString('utf8')) as Record<string, unknown>;
  assert.throws(() => parseCandidate({ ...changed, installer: { fileName: '../outside.exe', bytes: 1, sha256: '0'.repeat(64) } }), /invalid/);
  assert.throws(() => parseCandidate({ ...changed, installed: 'verified-ci', reports: [] }), /incomplete/);
});
test('installed evidence requires every successful scenario at the exact candidate commit', async t => {
  const root = await mkdtemp(join(tmpdir(), 'focusflow-candidate-evidence-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const scenario of INSTALLED_SCENARIOS) {
    await mkdir(join(root, scenario)); await writeFile(join(root, scenario, 'report.json'), JSON.stringify({ status: 'verified', commit: 'a'.repeat(40) }));
  }
  const reports = await collectInstalledEvidence(root, 'a'.repeat(40));
  assert.equal(reports.length, 4); assert.ok(reports.every(report => /^[a-f0-9]{64}$/.test(report.sha256)));
  await writeFile(join(root, 'review/report.json'), JSON.stringify({ status: 'verified', commit: 'b'.repeat(40) }));
  await assert.rejects(collectInstalledEvidence(root, 'a'.repeat(40)), /another commit/);
  await writeFile(join(root, 'review/report.json'), JSON.stringify({ status: 'failed', commit: 'a'.repeat(40) }));
  await assert.rejects(collectInstalledEvidence(root, 'a'.repeat(40)), /failed/);
});
test('an installer directory or malformed manifest cannot be treated as a verified artifact', async t => {
  const root = await mkdtemp(join(tmpdir(), 'focusflow-candidate-file-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'FocusFlow-0.1.0-test.1-x64.exe'));
  await assert.rejects(writeCandidate(root, metadata()), /regular installer/);
  await writeFile(join(root, 'candidate.json'), '{"format":"untrusted"}');
  await assert.rejects(verifyCandidate(root), /invalid/);
});
