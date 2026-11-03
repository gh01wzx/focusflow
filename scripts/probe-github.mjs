// Public read-only probe. No authorization header and no external mutations.
const repository = process.argv[2] || 'octocat/Hello-World';
if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) throw new Error('Expected owner/repository');
const checks = [];
for (const resource of ['', '/issues?per_page=1&state=all', '/pulls?per_page=1&state=all']) {
  try {
    const response = await fetch(`https://api.github.com/repos/${repository}${resource}`, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'FocusFlow-Phase0' },
      signal: AbortSignal.timeout(10000),
    });
    const payload = await response.json();
    checks.push({ resource: resource || '/repository', status: response.status, shapeValid: resource ? Array.isArray(payload) : typeof payload.full_name === 'string' });
  } catch (error) {
    checks.push({ resource: resource || '/repository', status: 'blocked', reason: error.cause?.code || error.name });
  }
}
const success = checks.every(check => check.status === 200 && check.shapeValid);
console.log(JSON.stringify({ repository, authorization: 'none', mutations: 0, checks }, null, 2));
if (!success) process.exitCode = 1;
