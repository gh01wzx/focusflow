import { execFileSync, spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { basename, isAbsolute, resolve } from 'node:path';
import { SCHEMA_VERSION } from '../src/database/schema.ts';
import { CANDIDATE_COMMANDS, collectInstalledEvidence, writeCandidate, verifyCandidate, CandidateError } from '../src/release/candidate.ts';

function git(args: string[]) { return execFileSync('git', args, { windowsHide: true, encoding: 'utf8', timeout: 5000, stdio: ['ignore','pipe','ignore'] }).trim(); }
function cleanSource() {
  if (git(['status','--porcelain'])) throw new CandidateError('Commit or discard local source changes before preparing a candidate.');
  const commit = git(['rev-parse','HEAD']), tree = git(['rev-parse','HEAD^{tree}']);
  if (!/^[a-f0-9]{40}$/.test(commit) || !/^[a-f0-9]{40}$/.test(tree)) throw new CandidateError('A known committed source identity is required.');
  return { commit, tree };
}
async function runNpm(args: string[]) {
  const npm = process.env.npm_execpath;
  if (!npm || !isAbsolute(npm) || basename(npm) !== 'npm-cli.js') throw new CandidateError('Run the candidate build through npm run release:candidate.');
  await new Promise<void>((resolveRun, reject) => {
    const child = spawn(process.execPath, [npm, ...args], { windowsHide: true, stdio: 'inherit' });
    child.once('error', () => reject(new CandidateError('A required candidate command could not start.')));
    child.once('exit', code => code === 0 ? resolveRun() : reject(new CandidateError('A required candidate command failed. No candidate is approved.')));
  });
}
async function main() {
  if (process.argv.includes('--verify')) {
    const manifest = await verifyCandidate(resolve('release'));
    console.log(JSON.stringify({ status: 'integrity-verified', commit: manifest.commit, installer: manifest.installer,
      installed: manifest.installed, trust: manifest.trust, publication: manifest.publication })); return;
  }
  if (process.platform !== 'win32') throw new CandidateError('Windows candidate packaging is required.');
  const identity = cleanSource(), ci = process.argv.includes('--record-ci');
  if (ci) {
    if (process.env.GITHUB_ACTIONS !== 'true' || process.env.RUNNER_OS !== 'Windows' || process.env.RUNNER_ENVIRONMENT !== 'github-hosted'
      || process.env.GITHUB_SHA !== identity.commit) throw new CandidateError('CI evidence must come from the current standard hosted Windows run.');
  } else {
    for (const command of CANDIDATE_COMMANDS) await runNpm(command.replace(/^npm /, '').split(' '));
  }
  const after = cleanSource();
  if (after.commit !== identity.commit || after.tree !== identity.tree) throw new CandidateError('Source changed during candidate checks. Earlier results do not approve this source.');
  const metadata = JSON.parse(await readFile(resolve('dist/src/runtime/build-info.json'), 'utf8')) as Record<string, unknown>;
  const packageInfo = JSON.parse(await readFile(resolve('package.json'), 'utf8')) as { version: string };
  if (metadata.commit !== identity.commit || metadata.tree !== identity.tree || metadata.dirty !== false || metadata.version !== packageInfo.version) {
    throw new CandidateError('The built metadata does not match this clean committed source. Rebuild before continuing.');
  }
  const reports = ci ? await collectInstalledEvidence(resolve('artifacts'), identity.commit) : [];
  const candidate = await writeCandidate(resolve('release'), { ...identity, version: packageInfo.version, schemaVersion: SCHEMA_VERSION,
    commands: [...CANDIDATE_COMMANDS], installed: ci ? 'verified-ci' : 'not-verified', reports });
  await verifyCandidate(resolve('release'));
  console.log(JSON.stringify({ status: 'candidate-prepared', ...candidate }));
  console.log('Candidate only. No public release, signing grant, automatic installation or update publication occurred.');
}
try { await main(); }
catch (error) {
  console.error(error instanceof CandidateError ? error.message : 'Candidate preparation or verification failed. Keep the previous candidate and inspect the current build/check stage.');
  process.exitCode = 1;
}
