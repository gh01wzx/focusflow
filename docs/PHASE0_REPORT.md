# Phase 0 closeout and Phase 1 handoff

Date: 2026-11-04 (Pacific/Auckland). Status: **core feasibility demonstrated; owner review requested for the bounded Phase 1 handoff in Issue #17**. This replaces the initial report. The MVP, product integrations and formal release are not complete.

## Proposed decision

Keep Electron + strict TypeScript + a React product renderer + SQLite. Retain the tested `node:sqlite` driver against pinned Electron; compatibility/migrations stay in CI. React is planned, not an already installed dependency. The current page remains a persistence experiment.

After owner merge approval of this closeout PR, begin **local Personal tasks and manual Projects only**. This explicitly changes the initial blanket gate: remaining integrations block the phases that use them, rather than unrelated local-task work. Writing this proposal does not approve that change. No product account connection, coding runner, publication, updater or deployment is enabled by this handoff; all original MVP acceptance scenarios still apply.

## Evidence ledger

Principal tested head: `56f73fec0cdc011ec9eebc56cd741cd8066365c1`, merged by [PR #16](https://github.com/gh01wzx/focusflow/pull/16) at `4d5b6ebf58f3163a777724ff9b184d75ff8d7b80`. Evidence applies to named code/configuration, not arbitrary later changes.

| Capability | Evidence | Limit |
| --- | --- | --- |
| Strict TypeScript and behavior | [Windows/Linux checks](https://github.com/gh01wzx/focusflow/actions/runs/41757461328): language/type/build checks and 36 tests passed | Ordinary tests use no live model or authenticated remote write |
| Windows runtime and installation | [Desktop workflow](https://github.com/gh01wzx/focusflow/actions/runs/41757461352): Electron 45.2.1, builder 26.18.0, Playwright 1.64.1; installed launch/relaunch and profile checks passed | Unsigned per-user NSIS artifact tested on CI Windows, not a signed public release |
| Data protection | Real SQLite tests and that workflow's upgrade/recovery job | Committed-WAL snapshots, transactional migration rollback, newer-schema refusal and separate-profile restoration tested |
| Manual upgrade | Baseline `14a30b166ef350961518cff586fb2ffa5c22db50` (app 0.0.1/schema 1) to app 0.0.2/schema 2 | Note data retained at the same install/profile paths; recovery preserved the upgraded database |
| Official Codex transport | Windows CI installs CLI 0.166.0, initializes and reads fresh unauthenticated status | Owned process and disposable directory close normally; no model runs in CI |
| Real streaming turn | Owner-reported Windows result at `4540ccc36dd1d2a6e4f868c6b9cda84b15c8eab9`: ChatGPT auth, 6 deltas, matching marker | One read-only model turn; owner evidence, not an independently repeated call |
| Real cancellation | Owner-reported Windows result at `56f73fec0cdc011ec9eebc56cd741cd8066365c1`: acknowledgement, interrupted terminal event, process closed, temp directory removed | One controlled turn; process termination alone never counts as cancellation |
| Approval/provider failures | Deterministic stream/process fixtures deny approvals and inject typed auth/quota/rate-limit, timeout and cleanup failures | Handling demonstrated; actual expired accounts and exhausted quota were not tested |
| GitHub development workflow | Real Issues, branches, PRs, checks and observed merges in `gh01wzx/focusflow` | The assistant's connector works; it does not authorize the installed Tracker product |

The desktop compatibility experiment observed Node 24.22.1 and SQLite 3.53.4 inside Electron. Source development remains Node 24.12.x or later 24.x. Later Electron/driver changes require fresh compatibility evidence.

An earlier upgrade job was cancelled and passed on retry; its cancellation cause was not established. The later exact-head workflow above passed. This establishes feasibility, not exhaustive installer reliability. Artifacts expire; preserve commit/run references and repeat relevant checks for later builds.

## Remaining gates

| Blocks | Required work | Current state |
| --- | --- | --- |
| Local tasks/manual Projects: Phase 1 | Product-specific data/profile isolation, task schema/UI, restart and migration acceptance | Foundation demonstrated; product implementation is next. No silent import of spike notes |
| Planning/Issue publication: Phase 2 | Product-owned authorization/secret storage, approved-plan boundary, repository association, durable outbox, timeout reconciliation and remote-edit conflicts | Not implemented; connector authorization cannot be reused as app authorization |
| Coding/review: Phase 3 | Restricted worktree/sandbox, visible approvals, least-privilege credentials, durable run recovery, real tests/branch/PR evidence, independent review and SHA invalidation | Read-only invocation/cancellation demonstrated; code-writing sandbox enforcement and approval UI remain unverified |
| Formal releases/updates: Phase 4 | Signing identity/cost decision, pinned updater verification, trusted metadata, user-triggered download/restart, data protection, failed install/migration recovery and dependency triage | Unsigned development artifacts only; no updater/feed configured and no GitHub Release published |

Actual expired-auth/quota failures remain unobserved. Injected structured errors exercise handling without altering credentials or deliberately exhausting quota. Later integration acceptance must cover realistic failures and label unobserved cases.

The captured desktop audit on the tested head reported **15 moderate** affected development-toolchain packages, with no high/critical entries. This is not a security-clean result and may change. Breaking forced dependency upgrades and bypassed signature verification are not approved fixes; release hardening remains required.

## Maintained tooling and authorization

Keep unsigned NSIS artifacts for development validation. Maintained `electron-updater` with NSIS/GitHub Releases remains the release candidate; there is no demonstrated need for a custom installer/updater. Signing identity, operating requirements/costs and update metadata trust must be settled before formal distribution. No signing service, purchase or new account is authorized by this handoff.

References checked on 2026-11-04: [v26 updater](https://www.electron.build/v26/docs/features/auto-update/) and [v26 signing](https://www.electron.build/v26/docs/features/code-signing/). Unversioned builder documentation currently describes unreleased v27 behavior; do not attribute its configuration/signing rules to pinned 26.18.0. Repeat verification against the versions selected for release.

[GitHub CLI browser login](https://cli.github.com/manual/gh_auth_login) is a maintained product-auth candidate, not an implemented connection. It can fall back from OS credential storage to a plaintext file; requested scopes and storage behavior must be validated before adoption. OAuth/GitHub App authorization remains an alternative. No token is requested in chat or committed.

## Next single Ticket: first usable Today slice

After owner approval, start one Ticket combining the proven shell/storage foundation with dated temporary tasks. Do not start it or batch-publish later Tickets in this closeout change.

Acceptance:

1. Open Personal / Today with clear English empty/loading/error states and the planned React/TypeScript renderer. Keep Node and credentials unavailable in the renderer. Do not show simulated Projects data.
2. Quickly add a nonempty temporary task with a valid planned date defaulting to the local calendar date. Preserve user-entered text in its original language.
3. Complete/cancel tasks and retain basic visible records and original planned dates. Pending tasks due today or earlier stay visible; future tasks remain accessible without appearing due today. Editing and recurrence may be small follow-ups.
4. Persist across app restarts in an explicit product profile outside source/install output. Do not overwrite or import `.phase0` notes or the dedicated Codex profile. Test the product's own data-upgrade path.
5. Test real SQLite/HTTP behavior, input/date validation, overdue/future filtering and restart persistence with disposable directories and an injectable local-date clock. Run required language/compiler/build checks and installed desktop smoke for the changed UI.

This slice adds no account connection, model call, app-created GitHub Issue or updater. Daily/weekly recurrence, Projects/action center, AI planning, coding/review and releases remain individually started Tickets. Recurrence/week/timezone defaults remain proposals for the recurrence Ticket. No complete MVP acceptance scenario is claimed here.
