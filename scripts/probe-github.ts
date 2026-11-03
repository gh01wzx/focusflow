// Public read-only probe. No authorization header and no external mutations.
const repository = process.argv[2] || 'octocat/Hello-World';
if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) throw new Error('Expected owner/repository');
interface GitHubProbeCheck {
  resource: string;
  status: number | 'blocked';
  shapeValid?: boolean;
  reason?: string;
}

function failureReason(error: unknown): string {
  if (!(error instanceof Error)) return 'UNKNOWN_ERROR';
  const cause = error.cause;
  return typeof cause === 'object' && cause !== null && 'code' in cause && typeof cause.code === 'string'
    ? cause.code : error.name;
}

const checks: GitHubProbeCheck[] = [];
for (const resource of ['', '/issues?per_page=1&state=all', '/pulls?per_page=1&state=all']) {
  try {
    const response = await fetch(`https://api.github.com/repos/${repository}${resource}`, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'FocusFlow-Phase0' },
      signal: AbortSignal.timeout(10000),
    });
    const payload: unknown = await response.json();
    const repositoryShape = typeof payload === 'object' && payload !== null && 'full_name' in payload && typeof payload.full_name === 'string';
    checks.push({ resource: resource || '/repository', status: response.status, shapeValid: resource ? Array.isArray(payload) : repositoryShape });
  } catch (error) {
    checks.push({ resource: resource || '/repository', status: 'blocked', reason: failureReason(error) });
  }
}
const success = checks.every(check => check.status === 200 && check.shapeValid);
console.log(JSON.stringify({ repository, authorization: 'none', mutations: 0, checks }, null, 2));
if (!success) process.exitCode = 1;
