# Validation and limits

Review evidence belongs to a commit, not a branch name. Check the current PR head and Checks tab; a new commit invalidates earlier approval.

## Current verification

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

The retired note-app tests were removed or transferred to product fixtures. A smaller test count does not imply the removed note UI is still maintained. Exact current results/counts are recorded in the PR.

Exact results, counts and tested commit SHAs belong to each PR and its Checks tab. Earlier runs do not verify a later commit. Renderer bundling in this restricted host has encountered an ancestor-directory read denial; a failed local build does not count as a pass. Use hosted checks for full build evidence when that restriction applies. This does not diagnose an ordinary Windows launch. CI screenshots are in windows-today; artifact presence alone is not a pass. Installed recurrence rollover uses prior-period fixtures and the real app clock; disposable store tests separately advance injected clocks across midnight/DST.

## Retained evidence

| Capability | Evidence | What remains outside that proof |
| --- | --- | --- |
| Phase 1 entry | PR #18 merged at 2a538a76d3a533dac3d6e33fb70765f0d5d20b11 | Other phases retain their own gates |
| Initial Today | [Checks](https://github.com/gh01wzx/focusflow/actions/runs/41767405580) and [Windows UI/recovery](https://github.com/gh01wzx/focusflow/actions/runs/41767405578), tested head 051f9d00cf443d5b261cbfc9ea5125f87a5a9edc | Historical pre-cleanup result, not approval of later code |
| Real Codex streaming | Owner-reported head 4540ccc36dd1d2a6e4f868c6b9cda84b15c8eab9: ChatGPT login, 6 deltas, marker matched | Not an independently repeated call or coding run |
| Real Codex cancellation | Owner-reported head 56f73fec0cdc011ec9eebc56cd741cd8066365c1: interrupt/terminal event and cleanup confirmed | Not proof of coding permissions or all provider failures |
| Phase 0 manual upgrade | [Windows run](https://github.com/gh01wzx/focusflow/actions/runs/41757461352): note data retained from app 0.0.1/schema 1 to 0.0.2/schema 2 | Not product-data import or a signed automatic update |

GitHub Issues/PRs and Git history are the development record. Old experiment documents/code are available at their historical commits rather than duplicated in the current tree.

## Known limits

- Project action center/dependencies and later MVP phases are unfinished; see the [MVP task index](https://github.com/gh01wzx/focusflow/issues/28).
- Product schema 1 is a synthetic test baseline, not a shipped older product.
- Installed checks have seen close/cancellation timeouts. Current smoke requires observed native exit code 0 and bounded stage waits; a retry does not establish a root cause.
- Last captured initial-Today audit: 15 moderate affected development packages, no high/critical entries. This is not a security-clean claim; advisories may change.
- Node 24.12 emits an experimental warning for node:sqlite. Compatibility is checked against pinned Electron; runtime/driver upgrades need new evidence.
- Installers are unsigned development artifacts. Signing, update trust, interrupted installs, rollback/recovery UI and formal release hardening remain open.
- Product GitHub authorization, writing-code sandbox/approvals, durable execution recovery and actual expired-auth/exhausted-quota failures remain unverified.

No personal database, credentials or raw execution logs belong in the repository.
