# Codex integration verification (P0-02)

Status: PR #14 is merged. On 2026-11-04 the owner reported a successful authenticated Windows model turn using CLI 0.166.0 at commit `4540ccc36dd1d2a6e4f868c6b9cda84b15c8eab9`: ChatGPT authentication, 6 agent-message delta events and a matching final marker. This is owner-provided evidence, not an independently repeated model call. A credential-free Windows CI job also verifies installation and unauthenticated status. Real cancellation, Windows sandbox enforcement and actual expired-auth/quota failures remain **unverified**. This does not pass the entire P0-02 gate or provide the product execution UI.

## Explicit developer verification

Use Node 24.12.x and a normal terminal in the repository. These are explicit developer commands. Desktop launch never runs them. CI runs installation and unauthenticated status only in its fresh runner profile; it never logs in or starts a model turn.

```powershell
npm run codex:install
npm run codex:login
npm run codex:status
npm run codex:probe -- --live
npm run codex:cancel -- --live
```

`codex:install` installs the official `@openai/codex@0.166.0` package and platform binary into `%LOCALAPPDATA%\FocusFlow\codex-phase0\runtime` on Windows (a private user development runtime, outside the repository). It does not change the project's dependency lock or bundle Codex into Electron. This version is an explicit spike compatibility target, not a promise of future protocol stability. Installation and native launch have CI and owner-reported evidence above. The locally discovered desktop App executable is an internal `0.166.0-alpha.5.1` build and is not selected as a Tracker dependency.

`codex:login` invokes the official browser login using a dedicated `CODEX_HOME` at `%LOCALAPPDATA%\FocusFlow\codex-phase0\profile`. The CLI owns its authentication files; FocusFlow does not read/copy raw credentials or attach to App conversations. The file credential store is explicitly selected to avoid reusing a global keyring account. Protect this directory as private account data. A normal terminal displays official interactive login output; the helper does not record it. No API key is requested. Status reads only the official `account/read` protocol and prints `chatgpt`, `apiKey` or `none`, omitting identity and token fields. The live probe accepts only ChatGPT login; API billing is outside this experiment. Account eligibility, allowance and organizational restrictions still apply.

The live command uses one default-model turn and consumes Codex allowance. It starts a new ephemeral thread in an empty OS temporary directory, requests a read-only sandbox with no approval escalation, and asks for a fixed marker without tools. Progress is reported as event kinds, with a final marker check and delta-event count. Assistant text, stderr, raw protocol errors, account identity and tokens are not printed or persisted by the helper. The CLI may maintain its own diagnostic files inside the private profile. Child environment variables are allowlisted; API keys, GitHub credentials and inherited Codex configuration overrides are not forwarded. Proxy/custom enterprise environments may need a later supported configuration design.

Ctrl+C requests interruption of this thread/turn. The helper closes its transport and terminates only its owned process tree after a grace period; it does not touch the existing desktop App. The temporary working directory is removed after process closure, while the dedicated login profile remains for future explicit runs. Native process cleanup, interruption delivery and sandbox enforcement need live Windows verification. Read-only sandbox is a requested official policy, not proof of a filesystem read boundary or network isolation. Unexpected tools cause the probe to fail and request interruption; the notification is evidence of an attempted tool, not a preventative tool firewall. Do not use this feasibility helper for private source or unrestricted coding tasks.

The new `codex:cancel -- --live` command starts exactly one turn with the same read-only/no-tools prompt and requests cancellation immediately on `turn/started`. It reuses the dedicated ChatGPT login and can consume Codex allowance. Success requires both an acknowledged `turn/interrupt` and a matching `turn/completed` event whose status is `interrupted`. Merely killing a process, receiving only an acknowledgement, or racing with a naturally completed answer does not pass; an inconclusive race reports `CANCELLATION_NOT_CONFIRMED`. It does not retry or start another turn automatically. Interruption waits at most five seconds; start requests race against cancellation and the whole-turn deadline. Final verified output is printed only after the owned process closes and its temporary cwd is removed.

Structured failures now distinguish `AUTH_REQUIRED`, `USAGE_LIMIT`, `RATE_LIMITED`, `SANDBOX_FAILED` and `CONNECTION_FAILED`, using only the pinned protocol's `codexErrorInfo` discriminants and typed connection-status fields. Unknown errors remain `RPC_FAILED`; free-form provider prose is never scanned for billing/auth guesses or exposed. An error notification with `willRetry: true` reports retry progress and waits for a terminal result or deadline. Cleanup failures retain a known primary task failure code and add `cleanupFailed: true`; they cannot produce verified output.

## Evidence boundaries

- Observed locally: the internal App CLI reports an alpha version; shell access to the npm registry fails with `EACCES`. No standalone official CLI installation, login or model invocation was completed in this development host.
- Automated tests: fake in-memory JSONL streams prove initialization ordering, request correlation, progress delivery, cancellation requests, fail-closed approval responses, malformed/oversized input handling, timeouts, connection failure, generic redacted RPC errors and single-turn result validation. They never prove that a real model ran or that native sandboxing worked.
- Code observation: a 15-second request timeout, 90-second model-turn timeout, bounded protocol lines and 4096-character final probe output bound the client. Unknown server requests receive an unsupported-method error; command/file approvals receive `cancel`. The feasibility client has no grant-approval API.
- Process integration tests launch a deterministic TypeScript fake app-server with Node in a disposable cwd. They exercise real OS pipes, cancellation with a missing start response, acknowledgement without terminal evidence, forced owned-process shutdown, spawn failure and directory removal. They use no model, credentials or network. This is native process/transport evidence, not real Codex model-cancellation evidence.
- Remaining live gates: the explicit cancellation command against real Codex; managed-policy/approval behavior and sandbox enforcement; actual expired-auth/quota failures. Structured error injection tests demonstrate handling without depleting the owner's quota or manipulating credentials.

Do not paste authentication files or full diagnostic logs into public Issues/PRs. The maintainer can report the compact status/evidence JSON and whether Ctrl+C stopped the owned process. A failed probe is a blocked gate, not a successful integration claim.

## Sources

- [Official app-server protocol](https://developers.openai.com/codex/app-server)
- [Official authentication documentation](https://developers.openai.com/codex/auth)
- [Pinned release](https://github.com/openai/codex/releases/tag/rust-v0.166.0)
- [Pinned thread-start schema](https://github.com/openai/codex/blob/rust-v0.166.0/codex-rs/app-server-protocol/schema/typescript/v2/ThreadStartParams.ts)
- [Pinned structured error variants](https://github.com/openai/codex/blob/rust-v0.166.0/codex-rs/app-server-protocol/schema/typescript/v2/CodexErrorInfo.ts)

Production account UX, runtime distribution/updates, credential-store choice, coding permissions, reconnect/restart reconciliation and detailed typed provider failures remain later work. They are not silently added to the MVP by this spike.
