import type { GitHubRepository, GitHubStatus } from '../shared/github.ts';
import { repositoryName, parseGitHubRepository, unavailableGitHub } from '../shared/github.ts';
import type { GitHubVault, StoredGitHub } from './vault.ts';

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
class GitHubFailure extends Error {}
function providerRepository(value: unknown) {
  const item = record(value);
  return parseGitHubRepository({ id: item.id, fullName: item.full_name, private: item.private });
}
export function createGitHubService(vault: GitHubVault, transport: typeof fetch = fetch, now = Date.now) {
  let saved: StoredGitHub | null = null;
  let loaded = false;
  let queue: Promise<unknown> = Promise.resolve();
  let preview: (GitHubRepository & { projectId: string }) | null = null;
  let repositories: GitHubRepository[] = [];
  let message = 'Connect GitHub explicitly. Connecting creates no Issues, branches or pull requests.';
  let device: { clientId: string; code: string; userCode: string; expiresAt: number; interval: number; next: number } | null = null;
  const shutdown = new AbortController();
  async function load() { if (!loaded) { saved = await vault.read(); loaded = true; } }
  async function state(projectId: string): Promise<GitHubStatus> {
    if (!await vault.available()) return { ...unavailableGitHub };
    await load();
    const connected = !!saved?.token && (saved.expiresAt === null || saved.expiresAt > now());
    return { available: true, connected, account: saved?.account || null, clientId: device?.clientId ?? saved?.clientId ?? '',
      repository: saved?.repositories[projectId] ?? null,
      preview: preview?.projectId === projectId ? { id: preview.id, fullName: preview.fullName, private: preview.private } : null,
      repositories: [...repositories],
      userCode: device?.userCode ?? null, nextPollAt: device?.next ?? 0,
      message: !connected && saved?.token && !device ? 'GitHub access expired. Authorize again; saved task data stays intact.' : message };
  }
  async function request(url: string, options: RequestInit = {}) {
    let response: Response;
    try { response = await transport(url, { ...options, redirect: 'error',
      signal: AbortSignal.any([shutdown.signal, AbortSignal.timeout(15000)]) }); }
    catch { throw new GitHubFailure('GitHub could not connect. Check your network, then retry.'); }
    if (!response.ok) {
      if (response.status === 401) {
        if (saved) { saved = { ...saved, token: '', expiresAt: 0 }; await vault.write(saved); }
        throw new GitHubFailure('GitHub access expired or was revoked. Authorize again.');
      }
      if (response.status === 403 || response.status === 429) throw new GitHubFailure('GitHub refused access or reached a rate limit. Check the App permissions, repository access and retry time.');
      if (response.status === 404) throw new GitHubFailure('Repository not accessible. Check owner/name and the GitHub App installation.');
      throw new GitHubFailure('GitHub could not complete the request. Retry later.');
    }
    try { return await response.json() as unknown; }
    catch { throw new GitHubFailure('GitHub returned an unreadable response. Retry later.'); }
  }
  const oauth = (path: string, fields: Record<string, string>) => request('https://github.com/login/' + path, {
    method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields).toString(),
  });
  async function api(path: string, token = saved?.token ?? '') {
    if (!token || (saved && token === saved.token && saved.expiresAt !== null && saved.expiresAt <= now())) {
      throw new GitHubFailure('GitHub access is missing or expired. Authorize GitHub again.');
    }
    return request('https://api.github.com' + path, { headers: {
      Accept: 'application/vnd.github+json', Authorization: 'Bearer ' + token, 'X-GitHub-Api-Version': '2022-11-28',
    } });
  }
  async function account(token: string) {
    const user = record(await api('/user', token));
    if (typeof user.login !== 'string' || !/^[A-Za-z0-9-]{1,39}$/.test(user.login)) throw new GitHubFailure('GitHub account response was invalid.');
    return user.login;
  }
  function run(projectId: string, operation: () => Promise<void>) {
    const pending = queue.then(async () => {
      try {
        if (!await vault.available()) return { ...unavailableGitHub };
        await load();
        if (shutdown.signal.aborted) throw new GitHubFailure('GitHub connection is closing.');
        await operation();
      } catch (error) {
        message = error instanceof GitHubFailure ? error.message : 'GitHub credential storage or response could not be used. Check the Windows credential store, then reconnect.';
      }
      return state(projectId).catch(() => ({ ...unavailableGitHub, available: true, message: 'Stored GitHub credentials could not be opened. Disconnect locally and authorize again; task data is unchanged.' }));
    });
    queue = pending.catch(() => {});
    return pending;
  }
  return {
    status: (projectId: string) => run(projectId, async () => {}),
    start: (projectId: string, clientId: unknown) => run(projectId, async () => {
      if (typeof clientId !== 'string' || !/^[A-Za-z0-9_.-]{5,100}$/.test(clientId)) throw new GitHubFailure('Enter the client ID of your registered GitHub App with device flow enabled.');
      if (device && device.expiresAt > now()) throw new GitHubFailure('Finish or cancel the current authorization first.');
      preview = null;
      const reply = record(await oauth('device/code', { client_id: clientId }));
      if (typeof reply.device_code !== 'string' || typeof reply.user_code !== 'string' || !/^[A-Z0-9-]{4,20}$/.test(reply.user_code)
        || reply.verification_uri !== 'https://github.com/login/device' || typeof reply.expires_in !== 'number'
        || reply.expires_in < 1 || reply.expires_in > 3600 || typeof reply.interval !== 'number' || reply.interval < 1 || reply.interval > 60) {
        throw new GitHubFailure('GitHub device authorization is unavailable. Check the App client ID and enable device flow.');
      }
      device = { clientId, code: reply.device_code, userCode: reply.user_code,
        expiresAt: now() + reply.expires_in * 1000, interval: reply.interval * 1000, next: now() + reply.interval * 1000 };
      message = 'Enter this code at GitHub. Review the App identity, requested permissions and selected repositories before authorizing.';
    }),
    poll: (projectId: string) => run(projectId, async () => {
      if (!device) return;
      const current = device;
      if (now() >= current.expiresAt) { device = null; throw new GitHubFailure('The GitHub device code expired. Start authorization again.'); }
      if (now() < current.next) return;
      current.next = now() + current.interval;
      const reply = record(await oauth('oauth/access_token', { client_id: current.clientId, device_code: current.code,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code' }));
      if (reply.error === 'authorization_pending') { message = 'Waiting for authorization at GitHub.'; return; }
      if (reply.error === 'slow_down') {
        current.interval += 5000; current.next = now() + current.interval;
        message = 'GitHub requested slower polling. Waiting before the next check.'; return;
      }
      if (reply.error) { device = null; throw new GitHubFailure('GitHub authorization ended or was refused. Check App setup and start again.'); }
      if (typeof reply.access_token !== 'string' || !/^ghu_[A-Za-z0-9_]{8,1000}$/.test(reply.access_token)) {
        device = null; throw new GitHubFailure('Expected a GitHub App user token. Check the App registration; OAuth App or pasted-token routes are not enabled.');
      }
      const login = await account(reply.access_token);
      if (shutdown.signal.aborted) throw new GitHubFailure('GitHub connection is closing.');
      const expiresAt = typeof reply.expires_in === 'number' && Number.isFinite(reply.expires_in)
        ? now() + Math.max(0, reply.expires_in) * 1000 : null;
      const value: StoredGitHub = { clientId: current.clientId, token: reply.access_token, account: login, expiresAt,
        repositories: saved?.account === login ? saved.repositories : {} };
      await vault.write(value); saved = value; device = null; preview = null; repositories = [];
      message = 'GitHub account checked. Select or inspect a repository before confirming its project link.';
    }),
    cancel: (projectId: string) => run(projectId, async () => { device = null; message = 'Authorization cancelled locally. Any code already issued expires at GitHub.'; }),
    check: (projectId: string) => run(projectId, async () => {
      if (!saved?.token || (saved.expiresAt !== null && saved.expiresAt <= now())) throw new GitHubFailure('Authorize GitHub again; its access is missing or expired.');
      const login = await account(saved.token);
      if (login !== saved.account) throw new GitHubFailure('GitHub account changed. Disconnect and authorize again.');
      const result = await api('/user/repos?per_page=100&sort=full_name');
      if (!Array.isArray(result)) throw new GitHubFailure('Could not read repository list.');
      repositories = result.map(providerRepository);
      message = 'Showing up to 100 accessible repositories. Enter owner/name to inspect another. Connecting does not publish anything.';
    }),
    inspect: (projectId: string, name: unknown) => run(projectId, async () => {
      preview = null;
      let fullName: string;
      try { fullName = repositoryName(name); } catch { throw new GitHubFailure('Enter a repository as owner/name.'); }
      preview = { ...providerRepository(await api('/repos/' + fullName.split('/').map(encodeURIComponent).join('/'))), projectId };
      message = 'Review the repository owner/name and visibility, then confirm the project link.';
    }),
    connect: (projectId: string, confirmed: unknown, id: unknown) => run(projectId, async () => {
      if (confirmed !== true || !preview || preview.projectId !== projectId || id !== preview.id || !saved) {
        throw new GitHubFailure('Inspect the repository and explicitly confirm this project link first.');
      }
      const checked = providerRepository(await api('/repos/' + preview.fullName.split('/').map(encodeURIComponent).join('/')));
      if (checked.id !== preview.id || checked.fullName !== preview.fullName || checked.private !== preview.private) {
        preview = null;
        throw new GitHubFailure('Repository name or visibility changed. Inspect it again before confirming.');
      }
      const value = { ...saved, repositories: { ...saved.repositories, [projectId]: checked } };
      await vault.write(value); saved = value; preview = null;
      message = 'Repository linked locally. No Issue, branch or pull request was created.';
    }),
    disconnect: (projectId: string) => {
      const pending = queue.then(async () => {
        // Serialize deletion after any in-flight token write so disconnect wins.
        await vault.clear();
        device = null; saved = null; loaded = true; preview = null; repositories = [];
        message = 'Local GitHub access and links removed for this profile. Task data is unchanged. Revoke the App at GitHub if desired.';
        return state(projectId);
      });
      queue = pending.catch(() => {});
      return pending;
    },
    async close() { shutdown.abort(); await queue; device = null; },
  };
}
export type GitHubService = ReturnType<typeof createGitHubService>;
