# Validation and limits

Review evidence belongs to a commit, not a branch name. Check the current PR head and Checks tab; a new commit invalidates earlier approval.

## Verification coverage

The maintained checks cover the scenarios below. This list describes coverage; execution results belong to the corresponding PR.

- Language, strict TypeScript, static dependency boundaries, build and compiled behavior tests.
- Browser clients against the real local API; malformed response rejection; architecture-guard failure cases.
- Real SQLite/HTTP/calendar checks with disposable directories.
- Migration rollback, backup failure, WAL snapshot consistency, checksum/target protection and product identity/newer-schema refusal.
- Windows installed UI: add/complete/cancel, overdue/future/history, text escaping, second instance, graceful exit and restart.
- Synthetic prior product schema migration and separate snapshot recovery.
- Daily/weekly rollover, closed-app catch-up, completion/cancellation, stop, restart, clock rollback, Auckland DST and failed reconciliation rollback.
- Schema 2 migration retains task identities/states; its backup can be restored separately.
- Schema 3 to 4 retains Personal/repeating data and a separate recovery point; project hierarchy/statuses survive restart and snapshots.
- Schema 4 to 5 retains existing weekly periods and project data; weekday selections survive restart and snapshot recovery.
- Selected weekdays skip unselected dates, catch up missed days and follow Auckland local dates across DST.
- Installed weekday controls retain choices after failed saves and across restart.
- Manual ticket validation, parent isolation, SQL constraints and HTTP request/size boundaries.
- Development/review/installed profile selection, per-checkout development paths, per-name/per-schema review paths, rejected path-like review names and conflicting test overrides.
- Sample initialization, persisted sample edits, unchanged synthetic everyday data, untouched older/newer review formats and upgrades only on an explicit separate copy.
- Installed ordinary and review windows running together, sample notices in Personal/Projects, review restart and unchanged synthetic everyday data. Review screenshots/reports are included under artifacts/review in windows-today.

Exact results, counts and tested commit SHAs belong to each PR and its Checks tab. Earlier runs do not verify a later commit. Renderer bundling in this restricted host has encountered an ancestor-directory read denial; a failed local build does not count as a pass. Use hosted checks for full build evidence when that restriction applies. This does not diagnose an ordinary Windows launch. CI screenshots are in windows-today; artifact presence alone is not a pass. Installed recurrence rollover uses prior-period fixtures and the real app clock; disposable store tests separately advance injected clocks across midnight/DST.

The project-browser job separately runs the project interface in sandboxed Chromium with disposable local data. It reuses the installed project interactions and checks persistence after restarting the browser context and local service. Its project-browser-ui artifact contains screenshots and a result report. This proves browser behavior only; Electron startup, native window close and Windows installation remain separate checks.

## Retained evidence

| Capability | Evidence | What remains outside that proof |
| --- | --- | --- |
| Phase 1 entry | PR #18 merged at 2a538a76d3a533dac3d6e33fb70765f0d5d20b11 | Other phases retain their own gates |
| Initial Today | [Checks](https://github.com/gh01wzx/focusflow/actions/runs/41767405580) and [Windows UI/recovery](https://github.com/gh01wzx/focusflow/actions/runs/41767405578), tested head 051f9d00cf443d5b261cbfc9ea5125f87a5a9edc | Historical pre-cleanup result, not approval of later code |
| Selected weekdays and Personal checks | [PR #70](https://github.com/gh01wzx/focusflow/pull/70), tested head a058c9d020120f25fd75458eb4ae979eb9fbc78b; links to cross-platform checks and installed UI/recovery | First installed check timed out on close; the second attempt passed without establishing the cause. These runs do not prove startup on the owner's current checkout |
| Real Codex streaming | Owner-reported head 4540ccc36dd1d2a6e4f868c6b9cda84b15c8eab9: ChatGPT login, 6 deltas, marker matched | Not an independently repeated call or coding run |
| Real Codex cancellation | Owner-reported head 56f73fec0cdc011ec9eebc56cd741cd8066365c1: interrupt/terminal event and cleanup confirmed | Not proof of coding permissions or all provider failures |
| Phase 0 manual upgrade | [Windows run](https://github.com/gh01wzx/focusflow/actions/runs/41757461352): note data retained from app 0.0.1/schema 1 to 0.0.2/schema 2 | Not product-data import or a signed automatic update |

GitHub Issues/PRs and Git history are the development record. Old experiment documents/code are available at their historical commits rather than duplicated in the current tree.

## Known limits

- Later MVP phases are unfinished; see the [MVP task index](https://github.com/gh01wzx/focusflow/issues/28).
- Product schema 1 is a synthetic test baseline, not a shipped older product.
- Installed checks have seen close/cancellation timeouts. Current smoke requires observed native exit code 0 and bounded stage waits; a retry does not establish a root cause.
- The historical initial-Today audit recorded 15 moderate affected development packages and no high/critical entries. It is not a current dependency assessment. Use the dependency-audit artifact from the specific Windows run under review; advisories may change.
- Startup on the owner's checkout remains unverified after the latest feature merge. [Task #73](https://github.com/gh01wzx/focusflow/issues/73) records the observed native failure and temporary workaround; neither a passing hosted run nor a retry establishes its cause or a permanent fix.
- Explicit developer data overrides and deliberate migration copies require care; use the [data paths and migration guide](DEVELOPMENT.md#data-paths). Ordinary review does not copy real tasks. Checks use synthetic everyday data, not the owner's personal database. Schema separation covers builds with the new launch behavior; earlier builds do not recognize review mode.
- Node 24.12 emits an experimental warning for node:sqlite. Compatibility is checked against pinned Electron; runtime/driver upgrades need new evidence.
- Installers are unsigned development artifacts. Signing, update trust, interrupted installs, rollback/recovery UI and formal release hardening remain open.
- Product GitHub authorization, writing-code sandbox/approvals, durable execution recovery and actual expired-auth/exhausted-quota failures remain unverified.

No personal database, credentials or raw execution logs belong in the repository.

Action-center checks cover cross-project ordering, one Ready recommendation, stale/non-Ready start rejection, persistence, malformed responses, installed detail expansion and failed-start recovery.

Project-edit checks cover text changes at every level, all six statuses, identity/parent retention, unchanged-text timestamps, invalid input, real HTTP boundaries, failed writes and restart persistence. Installed UI checks cover ticket cards and details dialogs, all six status buttons, failed status writes, compact creation dialogs, cancelled creation, focus restoration, edit dismissal locks, failed-save drafts, background refresh during editing, direct navigation and escaped non-English text.

Prerequisite checks cover recommendation/Start agreement, status changes between recommendation and Start, self/cycle/cross-project rejection, SQL constraints, malformed graphs, restart persistence and schema-5 backup/recovery protection. Installed checks link across milestones, navigate to a blocker and finish it before starting the dependent ticket.

Prerequisite picker UI checks cover empty-choice Save state, styled cancellation, card selection with mouse/Enter/Space, cancelled drafts, failed-save retention and persistence.
