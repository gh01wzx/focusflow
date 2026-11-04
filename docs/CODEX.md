# Standalone Codex checks

These developer commands are separate from Today. They do not attach to existing Codex App sessions.

## Setup

~~~powershell
npm run codex:install
npm run codex:login
npm run codex:status
~~~

The official CLI is pinned to 0.166.0. Its runtime and dedicated login profile are under %LOCALAPPDATA%\FocusFlow\codex-phase0. The CLI owns its credential files; the app does not copy/read raw credentials.

Login uses the official browser flow. Live checks accept ChatGPT authentication and refuse API-key mode.

## Optional live checks

~~~powershell
npm run codex:probe -- --live
npm run codex:cancel -- --live
~~~

Each command starts exactly one read-only/no-tools turn and uses the account's Codex allowance. They do not retry automatically. Normal app launch and CI do not start model turns.

- Probe: require the exact response marker; report streamed delta count.
- Cancel: interrupt on turn-start; require acknowledgement and a matching interrupted terminal event.
- Both: report verified output only after the owned process closes and its temporary directory is removed.

Ctrl+C requests cancellation. A timeout, missing terminal evidence or natural-completion race is reported as blocked, not successful cancellation.

Structured protocol fields classify auth, usage/rate limit, connection and sandbox failures. Provider prose/identity is not printed. Actual expired-account/quota failures and coding-sandbox enforcement remain unverified.

Use compact result JSON for review, never auth files or full diagnostic logs. [Evidence](VALIDATION.md) records the owner-reported real checks.
