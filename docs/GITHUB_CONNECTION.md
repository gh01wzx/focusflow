# GitHub project connection

This product-owned connection is separate from the ChatGPT GitHub connector. Setup reads metadata and saves a local project link. Separate explicit decisions publish coding Issues/source/PRs or close the linked Issue after an observed merge. New live authorization and writes remain unverified.

## Authorization decision

| Route | Local desktop fit | Access and limitations | Decision |
| --- | --- | --- | --- |
| GitHub App device flow | Client ID only; no embedded secret or callback server | Fine-grained permissions and selected installations; user reviews the App at GitHub | Implemented for review |
| OAuth App device flow | Also avoids a client secret | Broad repository scopes for private work; less precise than a GitHub App | Not selected |
| Fine-grained personal access token | Optional manual setup | User selects repositories/permissions, copies, rotates and revokes the secret | Implemented alternative; explicit encrypted-storage consent |
| ChatGPT connector credentials | Belong to the connector | Not available to the installed product | Not reusable |

Repository metadata read access is sufficient for connection. Issue publication needs Issues read/write; source branches/PRs need Contents and Pull requests read/write. Check evidence may need Checks/Commit statuses read access; missing evidence remains unknown. The owner grants access at GitHub explicitly; the app never broadens scopes. Creating workflow files can require further provider permission and may be refused.

## Try with your own App

1. Use the source desktop build and a separate review profile: `.\Start-FocusFlow.cmd --review github-connection`.
2. At GitHub App settings, register an App you control, enable Device Flow, and select read-only Repository metadata. Do not add repository content or Issue write permissions for this step. Install it on selected repositories you intend to inspect.
3. In Projects, open a project, expand **GitHub connection**, expand **Connection settings**, paste the App client ID and choose **Authorize GitHub**.
4. Open the official device page and enter the displayed code. Inspect the App name, permissions and repository selection before approving. Return to FocusFlow.
5. Check the account and repositories. The first 100 accessible repositories are offered; another accessible repository can be entered as owner/name.
6. Inspect the repository. Confirm its full name and Public/Private label, select the confirmation card, then choose Connect repository.
7. Restart the same profile and check its link. Disconnect this profile; project tasks must remain.

Registering an App and live account authorization are owner actions, not automated test steps. No live authorization was performed during implementation.

Alternatively, expand Connection settings, follow the official fine-grained token link, choose only the intended repository and permissions, paste the token into the password field and confirm encrypted local storage. Submit clears the input; the token is not returned in status responses or attached to coding/review prompts. A refused new token does not invalidate a different existing saved connection. Keep token creation/revocation under your own account control.

## Storage and failures

The Windows desktop uses Electron's asynchronous safeStorage API (Windows DPAPI). Only encrypted bytes are written to `github/connection.bin` within the selected profile, outside `data/tracker.db`. No token is returned to the renderer. Unavailable OS protection refuses connection rather than writing plaintext. If saved credentials cannot be opened while OS protection is available, local disconnect remains available to reset only the GitHub connection. Protection is against other Windows users; it does not protect against another process already running as the same user.

Device codes are memory-only. Only the access token is retained; refresh tokens are discarded. Expired or revoked access needs explicit authorization again. Local disconnect removes all GitHub credentials and project links for this profile without deleting tasks. GitHub App settings handle remote revocation separately.

The connection panel separates the account, repository selection and expandable connection settings. Setup is expanded when disconnected and collapsed after connection. All actions use the shared button styles; repository confirmation uses an explicit toggle card.

The browser-only app keeps manual projects available but cannot connect GitHub. No automatic sign-in, App registration, account scope change or external test write runs on launch. Network failures, rejected permissions and rate limits provide readable messages. The user may cancel locally; an already issued device code remains governed by GitHub's expiry.

## Verification boundaries

Unit/integration tests use simulated GitHub responses, disposable storage and real local HTTP. Windows installed smoke tests exercise actual safeStorage encryption/decryption and simulated repository confirmation/publication UI. These checks cannot prove a live App installation, current provider policy or real account access. An implementation may merge under the owner's explicit batch authorization; live authorization/write acceptance remains recorded separately until demonstrated at an exact build.

Official references:

- [GitHub App user tokens and device flow](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app)
- [OAuth device flow and polling rules](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps#device-flow)
- [OAuth App scopes](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/scopes-for-oauth-apps)
- [Repository metadata API](https://docs.github.com/en/rest/repos/repos)
- [Issue list, create and update API and required permissions](https://docs.github.com/en/rest/issues/issues)
- [Electron safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage)
