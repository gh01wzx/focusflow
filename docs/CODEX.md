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

## Controlled Windows write trial

~~~powershell
npm run codex:write-trial
# Only after separately agreeing to this allowance use:
npm run codex:write-trial -- --live
~~~

The default command prints scope only. It does not create a profile, start a process or call a model. The explicit live command uses the pinned official runtime and the existing dedicated Phase 0 ChatGPT profile; it refuses API-key mode and does not install or sign in automatically.

The live scope is one disposable TypeScript addition fix, three immutable checks, one owned outside sentinel and a loopback HTTP listener. It requests workspace-write with general temporary-directory write roots excluded and network disabled, uses the user approval reviewer, and cancels every escalation request. There are at most two model turns: one write/check turn, then an immediate cancellation turn only if the first observations pass. Ctrl+C, timeout, unknown tools, unrelated file patches, failure or incomplete evidence block the trial. There is no automatic retry or broader-permission fallback.

The three exact PowerShell commands must each complete with a matching exit code and marker. The host checks exact final file bytes, rejects extra files/symlinks, checks its outside sentinel and counts listener requests. Command strings, paths, prompts, provider prose, thread identifiers and credentials are not written to the result. Output appears only after the owned Codex process exits and its workspace is removed. The separate guard and listener are cleaned in a finalizer.

These are observations, not a security boundary. Tool notifications arrive after execution. They cannot establish all possible file/command restrictions; workspace-write is not private-file read isolation. A loopback probe does not establish internet, Git permission or approval behavior, nor production recovery. A denied request alone is not successful sandbox enforcement. Unrecognized permission errors or a provider wrapping/changing an exact check command leave evidence incomplete. Even an observations-complete result requires owner review and a separate decision in #49; this command never enables execution features.

Ordinary tests use fake protocol messages and disposable fixture files, with no live model or authenticated GitHub writes. CI does not run --live. The real Windows write/permission/cancellation gate remains open.
