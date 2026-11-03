# Phase 0 technical validation report

Date: 2026-11-03 (Pacific/Auckland). Status: **The local feasibility skeleton is complete. Integration and packaging checks remain; Phase 1 product features have not started.**

## Verified observations

| Area | Evidence | Scope of the result |
| --- | --- | --- |
| Windows environment | Node 24.12.0, npm 11.6.2, Git 2.53.0.windows.2; SQLite 3.50.4 in-memory query succeeded | Supports the experiment; does not establish Electron packaging compatibility |
| SQLite persistence | Database close/reopen preserves Unicode, emoji and SQL-like input | Demonstrates storage behavior, not task-management features |
| Local HTTP service | Real random-port startup, save, server restart, read and backup integration test | Demonstrates the minimal local execution/storage path |
| Backup and recovery | Online SQLite backup, integrity check and restoration into an independent database; later writes do not change the snapshot | Includes committed WAL data; not a software updater or automatic binary rollback |
| Older-version protection | A schema-1 binary refuses a schema-999 test database; file bytes stay identical | Refuses an incompatible database; future business migrations remain untested |
| Local HTTP boundaries | Cross-origin writes, incorrect Host and oversized requests are rejected | Limited to the spike; future execution/credential interfaces need separate validation |
| Independent Codex process | A discovered `codex-cli 0.166.0-alpha.5.1` completes stdio `initialize`/`initialized` in an isolated temporary home | No account access, model turn, existing-session control or coding task was performed |
| Public repository bootstrap | The owner created `gh01wzx/focusflow`; the connected development GitHub app wrote Issue/branch/commit/PR records | Demonstrates the assistant's integration, not the future Tracker app's authorization |
| TypeScript migration | All six local source-runtime tests pass; PR #4 CI passed strict type checking, Node/browser builds and compiled tests on Windows and Ubuntu | Runtime type stripping alone is not type checking; hosted compiler evidence is recorded separately |

The six storage/HTTP tests passed locally. The initial Host-header test used Node fetch, which did not preserve the custom test header; switching the test transport to `http.request` produced the intended boundary check. This original failure was corrected before reporting a passing result.

The original test page was loaded in a browser and its initial data-loaded state inspected. Behavioral evidence comes from HTTP/SQLite tests, not from the screenshot alone. English interface copy is a subsequent change; a new visual browser check has not been claimed.

`Start-FocusFlow.cmd` opens the experiment through `npm start`, which builds the TypeScript source first. It requires Node and a one-time `npm ci` developer setup. Initial runtime testing started Node directly; Explorer double-click acceptance has not been claimed. The proposed installed desktop product will bundle its runtime. Spike-only data remains in `.phase0/data/`.

## Documented capabilities that still need integration tests

- Official Codex app-server documentation describes thread/turn lifecycle, streamed progress, approvals and authentication. Only an isolated handshake was verified locally. A supported CLI version, login, sandbox/approval behavior, model quota/cost and interrupted-run recovery remain unverified. Desktop-app login does not establish that a custom client can execute tasks.
- GitHub REST supports Issues, branches and PRs. The assistant exercised this through its connected development app. Tracker's own authentication, durable publication outbox, conflict handling, retry reconciliation and merge synchronization are still product work.
- Electron, NSIS and electron-updater provide candidate release tooling. Package signing, installation, version A-to-B updating, database migrations and failure recovery have not been tested. Availability of a library is not evidence that updating works.

## Resolved initial blockers and continuing limitations

The repository destination and public authorization were initially missing. The owner later approved the desktop direction, created the repository, connected GitHub, and approved merges of PR #2 (bootstrap) and PR #4 (TypeScript). Those initial setup blockers are resolved.

The execution environment still restricts direct network access: unauthenticated public GitHub GET probes and npm registry access returned `EACCES`. This does not diagnose the user's account, the remote service or their ordinary terminal. Local Git staging was also denied at `.git/index.lock`. No permissions were changed; the connected GitHub API publishes audited source snapshots. CI installs the committed lockfile and performs compiler/build checks in its own normal build environment.

Codex is not on PATH. The discovered internal executable is an alpha build and is not a production dependency commitment. Authenticated model calls, generated changes, tests/PR creation by the future Tracker runner and quota handling remain unverified.

Electron is not installed in the tested environment. No installer, signing certificate or real update test exists. A dotnet host was found, but `dotnet --list-sdks` produced no SDKs; Rust/cargo were not found on PATH.

## Approved direction and next gates

The approved desktop direction is Electron + TypeScript/React + SQLite with a separate Codex app-server adapter. NSIS-based release tooling is a candidate pending its feasibility experiment. This is an engineering recommendation based on daily launch and integration costs, not a measured claim of optimal performance. See [ADR-001](ADR-001.md).

Proposed task defaults retain original dates for pending temporary tasks and use local-calendar recurrence. Day boundaries, offline periods, timezone changes and DST require explicit behavior and tests. Unconfirmed defaults are listed in the [product baseline](PRODUCT_BASELINE.md).

Next gates are supported Codex/runtime authentication and execution checks, Windows packaging/update feasibility, and individually reviewed Tickets from the [working roadmap](NEXT_TICKETS.md). **Neither the full MVP nor all Phase 0 acceptance criteria are complete.**
