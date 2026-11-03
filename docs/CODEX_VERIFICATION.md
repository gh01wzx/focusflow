# Codex integration verification (P0-02)

Status: protocol client and deterministic tests implemented. Authenticated CLI/model execution, Windows sandbox behavior, real cancellation and actual quota failures are **unverified**. This does not pass the entire P0-02 gate or provide the product execution UI.

## Explicit developer verification

Use Node 24.12.x and a normal terminal in the repository. The commands are opt-in; neither desktop launch nor CI runs them.

```powershell
npm run codex:install
npm run codex:login
npm run codex:status
npm run codex:probe -- --live
```

`codex:install` installs the official `@openai/codex@0.166.0` package and platform binary into `%LOCALAPPDATA%\FocusFlow\codex-phase0\runtime` on Windows (a private user development runtime, outside the repository). It does not change the project's dependency lock or bundle Codex into Electron. This version is an explicit spike compatibility target, not a promise of future protocol stability. Installation and native launch still require verification on the owner's machine. The locally discovered desktop App executable is an internal `0.166.0-alpha.5.1` build and is not selected as a Tracker dependency.

`codex:login` invokes the official browser login using a dedicated `CODEX_HOME` at `%LOCALAPPDATA%\FocusFlow\codex-phase0\profile`. The CLI owns its authentication files; FocusFlow does not read/copy raw credentials or attach to App conversations. The file credential store is explicitly selected to avoid reusing a global keyring account. Protect this directory as private account data. A normal terminal displays official interactive login output; the helper does not record it. No API key is requested. Status reads only the official `account/read` protocol and prints `chatgpt`, `apiKey` or `none`, omitting identity and token fields. The live probe accepts only ChatGPT login; API billing is outside this experiment. Account eligibility, allowance and organizational restrictions still apply.

The live command uses one default-model turn and consumes Codex allowance. It starts a new ephemeral thread in an empty OS temporary directory, requests a read-only sandbox with no approval escalation, and asks for a fixed marker without tools. Progress is reported as event kinds, with a final marker check and delta-event count. Assistant text, stderr, raw protocol errors, account identity and tokens are not printed or persisted by the helper. The CLI may maintain its own diagnostic files inside the private profile. Child environment variables are allowlisted; API keys, GitHub credentials and inherited Codex configuration overrides are not forwarded. Proxy/custom enterprise environments may need a later supported configuration design.

Ctrl+C requests interruption of this thread/turn. The helper closes its transport and terminates only its owned process tree after a grace period; it does not touch the existing desktop App. The temporary working directory is removed after process closure, while the dedicated login profile remains for future explicit runs. Native process cleanup, interruption delivery and sandbox enforcement need live Windows verification. Read-only sandbox is a requested official policy, not proof of a filesystem read boundary or network isolation. Unexpected tools cause the probe to fail and request interruption; the notification is evidence of an attempted tool, not a preventative tool firewall. Do not use this feasibility helper for private source or unrestricted coding tasks.

## Evidence boundaries

- Observed locally: the internal App CLI reports an alpha version; shell access to the npm registry fails with `EACCES`. No standalone official CLI installation, login or model invocation was completed in this development host.
- Automated tests: fake in-memory JSONL streams prove initialization ordering, request correlation, progress delivery, cancellation requests, fail-closed approval responses, malformed/oversized input handling, timeouts, connection failure, generic redacted RPC errors and single-turn result validation. They never prove that a real model ran or that native sandboxing worked.
- Code observation: a 15-second request timeout, 90-second model-turn timeout, bounded protocol lines and 4096-character final probe output bound the client. Unknown server requests receive an unsupported-method error; command/file approvals receive `cancel`. The feasibility client has no grant-approval API.
- Remaining live gates: supported CLI installation/handshake and ChatGPT authorization; real streamed result; user cancellation/native cleanup; managed-policy and approval behavior; actual expired-auth/quota failures. Generic failures currently use safe codes rather than guessing a quota diagnosis from free-form provider messages.

Do not paste authentication files or full diagnostic logs into public Issues/PRs. The maintainer can report the compact status/evidence JSON and whether Ctrl+C stopped the owned process. A failed probe is a blocked gate, not a successful integration claim.

## Sources

- [Official app-server protocol](https://developers.openai.com/codex/app-server)
- [Official authentication documentation](https://developers.openai.com/codex/auth)
- [Pinned release](https://github.com/openai/codex/releases/tag/rust-v0.166.0)
- [Pinned thread-start schema](https://github.com/openai/codex/blob/rust-v0.166.0/codex-rs/app-server-protocol/schema/typescript/v2/ThreadStartParams.ts)

Production account UX, runtime distribution/updates, credential-store choice, coding permissions, reconnect/restart reconciliation and detailed typed provider failures remain later work. They are not silently added to the MVP by this spike.
