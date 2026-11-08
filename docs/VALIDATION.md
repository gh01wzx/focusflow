# Validation and limits

## Current implementation acceptance

The owner requested completion of source features before unified local testing. New worktree preparation, coding permissions/runs/recovery, source/PR publication, review/questions/revisions, merge completion and fine-grained-token connection are implemented but untested. No tests, native launch, live model, authenticated product write, installer or release were run for this batch. Static compiler/language results belong to their exact PR commit. Workflows are manual-only; no checks is not passing checks.

Use Start-FocusFlow.cmd, optionally --review NAME, for owner acceptance. By default it builds source and opens fixed personal data; --review NAME opens separate samples. It does not run tests or call a model. Follow [the coding/review path](USAGE.md#code-and-review-one-ticket) when choosing to exercise live integrations. Earlier evidence below applies to its recorded commits and does not verify the new implementation. Historical scripts/tests remain available but need current scenarios before future automated acceptance.

Review evidence belongs to a commit, not a branch name. Check the current PR head and Checks tab; a new commit invalidates earlier approval.

## Verification coverage

The maintained checks cover the scenarios below. This list describes coverage; execution results belong to the corresponding PR.

- Language, strict TypeScript, static dependency boundaries, build and compiled behavior tests.
- Browser clients against the real local API; malformed response rejection; architecture-guard failure cases.
- Real SQLite/HTTP/calendar checks with disposable directories.
- AI draft checks use simulated replies for consent, fresh ChatGPT account gates, shared concurrency, bounded JSON/graphs, progress/cancel/late replies, old-draft retention, unchanged formal tasks, restart and snapshots. No live model or authenticated GitHub writes run in tests.
- Shutdown checks use incomplete JSON bodies and pre-header sockets, verify accepted writes finish before database closure, retain cancellation errors and ensure cleanup runs once. Installed review checks include a pending incomplete loopback request while closing, with the original 15-second native-exit deadline and fixed phase-only diagnostics.
- Board checks assert all four columns fit normal window widths and top Previous/Next controls expose all of Done at a narrow width; links/status interaction checks run after restoring the original viewport.
- Migration rollback, backup failure, WAL snapshot consistency, checksum/target protection and product identity/newer-schema refusal.
- Format 6/7 to 8 retains ticket IDs/text/timestamps, prerequisites, Personal/weekly data and published draft JSON. Legacy Ready/Blocked conversion retains blocking; old snapshots restore their original statuses. Failed rebuild and failed backup retain old schema/data/constraints.
- Four-status blocker checks cover explicit manual reasons, rejected old status writes, read validation, same-origin HTTP, both Start paths, clearing without automatic status changes, failed-save retention, direct cross-milestone card links and exact-ticket navigation from Action center.
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
- Installed ordinary and review windows running together, sample notices in Personal/Projects, review restart and unchanged synthetic everyday data. Local review screenshots/reports are written under artifacts/review. CI prints result reports in the run log and does not upload files.

Exact results, counts and tested commit SHAs belong to each PR and its Checks tab. Earlier runs do not verify a later commit. Renderer bundling in this restricted host has encountered an ancestor-directory read denial; a failed local build does not count as a pass. Use hosted checks for full build evidence when that restriction applies. This does not diagnose an ordinary Windows launch. Current CI retains run logs rather than uploaded screenshots/installers; historical artifact links are only evidence for their original runs. Installed recurrence rollover uses prior-period fixtures and the real app clock; disposable store tests separately advance injected clocks across midnight/DST.

The project-browser job separately runs the project interface in sandboxed Chromium with disposable local data. It reuses the installed project interactions and checks persistence after restarting the browser context and local service. The run log includes its result or failure report; generated screenshots stay on the disposable runner and are not uploaded. This proves browser behavior only; Electron startup, native window close and Windows installation remain separate checks.

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
- The historical initial-Today audit recorded 15 moderate affected development packages and no high/critical entries. It is not a current dependency assessment. Use the dependency-audit summary in the specific Windows run under review; advisories may change.
- Startup on the owner's checkout remains unverified after the latest feature merge. [Task #73](https://github.com/gh01wzx/focusflow/issues/73) retains the observed native failure and temporary workaround. Current build/readiness/runtime diagnostics make distinct failures observable; a passing hosted run or retry does not establish the cause or permanent resolution of every historical native crash.
- Explicit developer data overrides and deliberate migration copies require care; use the [data paths and migration guide](DEVELOPMENT.md#data-paths). Ordinary review does not copy real tasks. Checks use synthetic everyday data, not the owner's personal database. Schema separation covers builds with the new launch behavior; earlier builds do not recognize review mode.
- Node 24.12 emits an experimental warning for node:sqlite. Compatibility is checked against pinned Electron; runtime/driver upgrades need new evidence.
- Installers are unsigned development artifacts. Signing, update trust, interrupted installs, rollback/recovery UI and formal release hardening remain open.
- Product GitHub authorization, writing-code sandbox/approvals, durable execution recovery and actual expired-auth/exhausted-quota failures remain unverified.

No personal database, credentials or raw execution logs belong in the repository.

Action-center checks cover cross-project ordering, one unblocked Backlog recommendation, stale/non-Backlog start rejection, persistence, malformed responses, installed detail expansion and failed-start recovery.

Project-edit checks cover text changes at every level, all four statuses, identity/parent retention, unchanged-text timestamps, invalid input, real HTTP boundaries, failed writes and restart persistence. Installed UI checks cover ticket cards and details dialogs, all four status buttons, failed status writes, compact creation dialogs, cancelled creation, focus restoration, edit dismissal locks, failed-save drafts, background refresh during editing, direct navigation and escaped non-English text.

Prerequisite checks cover recommendation/Start agreement, status changes between recommendation and Start, self/cycle/cross-project rejection, SQL constraints, malformed graphs, restart persistence and schema-5 backup/recovery protection. Installed checks link across milestones, navigate to a blocker and finish it before starting the dependent ticket.

Prerequisite picker UI checks cover empty-choice Save state, styled cancellation, card selection with mouse/Enter/Space, cancelled drafts, failed-save retention and persistence.

## GitHub connection

Simulated provider tests cover explicit device grants, polling intervals, cancellation, repository identity/visibility confirmation, revoked access and disconnect serialization. Disposable vault tests use a fixture codec; installed Windows smoke separately checks real async safeStorage and simulated UI. A real GitHub App and owner account trial remain unverified; see [setup and limits](GITHUB_CONNECTION.md).

Independent browser and installed review checks share simulated GitHub panel interactions, connection settings visibility, mouse/keyboard confirmation, rename invalidation, failed reads and disconnect protection against late status responses. Browser simulation does not verify Windows encryption or live authorization.

The AI connection preview has simulated service/HTTP checks for explicit usage consent, account-mode refusal, sanitized failures, early sign-in completion, cancellation and invalid sign-in links. A shared browser/installed UI scenario demonstrates missing runtime and simulated account/consent behavior. Disposable runtime fixtures check Windows x64/ARM64 native selection and missing/version-mismatch refusal; a simulated silent cancellation reply must not block a fresh account check. These checks do not prove the absence of a visible console in a live Windows login; they do not call a model. Product-profile sign-in, Windows keyring behavior and a real opted-in response require owner-triggered evidence before the AI integration gate is accepted.

## Historical installer/update route

Installation and updating are outside the personal-use scope. The historical [release-route experiment](RELEASE_ROUTE.md) covers offline full-installer replacement, same-schema task/schedule/project/status/prerequisite preservation and separate snapshot recovery in a disposable hosted Windows environment. Reports are printed in the run log; no artifacts are uploaded. A passing experiment does not prove signing, download verification, a real update feed, SmartScreen trust, cross-schema rollback, credential preservation or an in-app one-click update. Exact results and failures belong in the corresponding PR. Formal distribution remains gated on owner choice and a genuine trusted update trial.

The same experiment reads the installed Desktop and Start menu shortcut targets, checks that they open everyday data without developer arguments, and starts the checked executable again in an isolated profile. The second process must exit successfully, restore the minimized existing window and retain exactly one window, the same local server and unchanged records. An intentionally conflicting review/test selection must exit with a clear profile error before creating data. This covers installed entry behavior without treating a shortcut-target check as a manual click or a trusted release.
## Coding intent

Local service tests cover unpublished mode changes, missing-mode preservation, blocked coding Start/status writes, atomic rejection, restart, checked response decoding, simulated Issue identity and repository/mode locks. Migration coverage retains format-8 tasks/dependencies and restores its pre-upgrade snapshot. The browser/installed shared scenario creates a coding draft, verifies unavailable progress controls, switches to Manual and back, and retains the final coding record across restart. No Issue is published and no model/account write occurs in these checks. Real publication and coding permission validation remain separate work.

## Local plan approval

Disposable SQLite/HTTP tests cover saved edits/selection, stale revisions, invalid graphs, omitted prerequisites, explicit confirmation, manual/coding Backlog records, cross-milestone links, approval replay/restart, lost replies, atomic rollback after all task writes, durable receipts/snapshots and format-9 backup/recovery/refused-upgrade behavior. The shared browser/installed simulated UI checks cover text escaping, edit dismissal locks, failed-save input, cancellation, exact preview, confirmation and reopening an approved plan. Fresh sample data includes a saved practice draft; everyday and existing sample profiles are never seeded. These checks do not publish Issues, spend model allowance or validate product GitHub write permissions.

## Coding Issue publication

Simulated provider tests with disposable SQLite cover batch approval, private-context exclusion, stale-preview refusal, canonical Issue IDs/dependencies, repeated approval, partial success, lost create replies, restart recovery, uncertain absent/duplicate markers, remote-edit preservation, final-PATCH retries and definite refusal. The real loopback API enforces Origin and checked project identity. Shutdown during an owned simulated POST aborts transport before data closure and retains uncertainty. Format-10 migration has an independently restorable snapshot. Shared browser/installed UI exercises repository/visibility/content preview, explicit whole-batch consent, escaping, published links and reopening without another write. These results do not verify a live GitHub App installation/write grant; no account permission was changed or real Issue created by product tests.

## Linked work comparison

Disposable service/HTTP tests cover known/unknown comparison baselines, local/remote differences, explicit/stale decisions, remote rechecks, unknown/ambiguous fields, task-marker/identity retention, out-of-order refreshes, offline evidence retention, snapshots and format-11 recovery. Simulated provider reads sanitize Issue/PR fields; PR linking rejects unrelated or replacement identities and preserves changed heads/merge evidence. Closed Issues, closed-unmerged PRs and observed merges do not auto-complete tickets. The shared browser/installed scenario checks comparison, escaped public text, confirmed local edits, failed-save input, dismissal locks and deliberate remote-field adoption. No provider write, account scope change or live model is part of sync checks.

## Startup and build identity

Disposable process tests cover runtime success, missing executable, native nonzero exit, silent exit, one bounded timeout and raw-output exclusion. A guard-profile scenario refuses a runtime that opens task data. Readiness tests distinguish window-load failure from successful loading with no usable rendered interface; same-origin readiness is explicit/idempotent. The shared browser/installed scenario checks real build fields and focus restoration. Windows desktop CI adds one data-free runtime attempt before ordinary installed checks and stops on a failure. Native/crash/owner-checkout conclusions remain limited to the exact executed runs; no retry diagnoses an earlier crash.

## Complete manual project

The shared manual-project scenario starts with a separate empty workspace, retains a Personal sentinel, creates a two-milestone/three-ticket reading project, sets two prerequisite links and completes each task through explicit Action center Start, Review and Done. It edits the summary during the workflow and checks that unfinished prerequisites prevent the next recommendation. The board and saved hierarchy must agree on all three Done records. A fresh browser/server context and a separately restarted installed app must retain exact IDs, text, dependencies and statuses. No model generation, account authorization or Issue publication is requested. The Windows command is `node dist/scripts/smoke-today.js INSTALLED_EXE --manual-completion`; it reuses owned native exit checks and disposable data. Its report records the tested commit separately from other installed scenarios. This is automated manual-workflow evidence, not the live coding/update MVP scenario or a claim about subjective owner usability.

## Release candidate preparation

Disposable artifact tests verify checksum/size binding, tampered installer rejection, known source identity, required checks, traversal refusal, failed metadata preserving the previous candidate, non-file installers and exact-commit installed evidence. Windows CI prepares/verifies candidate metadata after all installed scenarios and includes only hashes/identities in its log. Ordinary tests never execute these synthetic installer fixtures. Candidate verification proves recorded local integrity/provenance checks, not publisher signing, public availability, SmartScreen trust or a genuine trusted update chain.
