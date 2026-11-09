# Development

The product is a personal-use local tool run from source. Start-FocusFlow.cmd is the only Windows command file; it also accepts --review NAME. The owner requested implementation without automated tests or live model trials. Verification workflows are manual-only, and neither their absence nor a merged PR is evidence that the new code works. Formal installation, signing, distribution, release and updating are outside scope.

Prerequisite: Node 24.12.x or later 24.x. Install exact dependencies with npm ci.

## Where information belongs

| Content | Main location |
| --- | --- |
| Planned work and task status | GitHub Issues, starting at the [MVP task index](https://github.com/gh01wzx/focusflow/issues/28) |
| Current use and launch instructions | [README](../README.md) |
| Detailed task, project and optional integration instructions | [Usage](USAGE.md) |
| Current code layout and reading path | [Architecture](ARCHITECTURE.md) |
| Developer commands, data profiles and recovery | This document |
| Approved product scope | [Product baseline](PRODUCT_BASELINE.md) |
| Verification coverage and limits | [Validation](VALIDATION.md) |
| Lasting collaboration rules | [AGENTS.md](../AGENTS.md) |
| Change-specific results and history | The corresponding PR and Git history |

Update the main location when information changes. Link to it elsewhere instead of copying temporary task status. Keep future features in Issues until a selected task needs an implementation.

## Tasks and PRs

Use the [task template](../.github/ISSUE_TEMPLATE/task.md) for one user story and the [PR template](../.github/pull_request_template.md) for its proposed change. Explain maintenance work through the owner's problem and an observable result too.

After GitHub creates an Issue, add its actual number to the title; do not guess the next number. Follow [AGENTS.md](../AGENTS.md#work-with-the-owner) for naming and owner decisions. For example, task 21 uses [21] Create tasks that repeat daily or weekly and branch 21-repeat-daily-or-weekly. The PR uses the same task ID and Closes #21; its GitHub PR number is separate.

## Commands

| Command | Purpose |
| --- | --- |
| npm start | Clean/build and open separate development sample data |
| npm run review -- pr-72 | Clean/build and open named review sample data |
| npm run start:web | Open development sample data in a browser |
| npm run check:language | Check maintained source/docs for accidental Han-script text |
| npm run diagnose:desktop | Try the built Windows runtime once, without opening task data; report bounded startup evidence |
| npm run typecheck | Dependency boundaries plus strict Node, browser, desktop and tooling checks |
| npm run check:boundaries | Static module boundaries, unresolved imports and runtime cycles |
| npm run build | Clean ignored dist output, compile TypeScript and bundle assets |
| npm test | Run compiled tests |
| npm run test:source | Optional Node type-stripping execution; not a type check |
| npm run ai:install | Explicitly install pinned Codex into the separate product runtime; no login or model turn |

Start-FocusFlow.cmd builds and opens fixed personal data using npm start -- --personal. Start-FocusFlow.cmd --review pr-72 opens separate sample data. npm start without --personal remains a developer sample launch. Existing development/review data is not automatically imported into the personal profile. Run npm ci again when dependencies change.

## Source and generated files

[Architecture](ARCHITECTURE.md) maps the folders and the code-reading path. Source lives in public and src; scripts prepare or check the app; test contains automated scenarios. Generated dist files and installer output are ignored by Git.

The build removes only the validated project dist directory before compiling. Deleted source files therefore cannot survive as stale compiled code.

## Data paths

| Launch | Directory under %LOCALAPPDATA%\FocusFlow |
| --- | --- |
| Start-FocusFlow.cmd / source --personal / legacy installed default | desktop |
| npm start / browser developer default without --personal | development\CHECKOUT_ID\schema-N |
| Source or installed --review pr-72 | reviews\pr-72\schema-N |

Each directory contains data\tracker.db. N is the running build's database format; CHECKOUT_ID is a stable hash of the source directory. Reopening the same directory/name and format keeps changes. Named reviews can be reopened from another checkout; use a distinct name for each PR or independent trial. A schema change opens a separate sample workspace. No automatic import, reset or deletion occurs.

Coding worktrees are retained in coding-workspaces\TICKET_ID beside data in the selected profile. Runs, publication journals and review decisions stay in that profile's database. Pending permission requests are memory-only and never automatically approved on restart. Schema 13-16 append these tables without rewriting applied migrations. Reopening only reconciles saved state; another model turn or remote write requires its own explicit action.

Development/review windows show a sample-data notice and title. Examples are added only when creating a database; reopening an existing database, including a deliberate migration copy, does not add examples. First-time examples are written in one transaction. A failed initial seed fails startup without partial examples; it does not delete the new database. Use a new review name for a fresh trial after investigating that failure.

Explicit developer overrides remain available for existing tools: FOCUSFLOW_TEST_PROFILE selects a desktop-test directory, and FOCUSFLOW_DATA_DIR selects browser-service data directly. Neither seeds examples. Clear FOCUSFLOW_TEST_PROFILE before using --review; a conflict is refused. Browser review mode ignores FOCUSFLOW_DATA_DIR and uses the named review. These overrides are not everyday/review launch instructions.

Previous spike, development/review data and the separate Codex profile are never imported or deleted by source cleanup. The personal source launcher reuses the established desktop everyday-data location. Its path does not change with checkout or schema version, and it never seeds examples. --personal refuses --review or FOCUSFLOW_TEST_PROFILE conflicts rather than silently choosing another profile.

Private plan drafts use the current profile database and its snapshots. Reopening a draft reads local storage only. The shared current shutdown path cancels planning before data closure. No new schema version is introduced for enabling this interface.

## AI account setup and validation

The AI connection preview uses official Codex app-server over owned stdio, pinned to 0.166.0, with a shared codex-product runtime, a codex-profile directory in the selected app profile, and keyring credential mode. The existing codex-phase0 probe remains separate and keeps its established commands. Runtime installation needs Node 24/npm; the desktop bundles neither a model nor this external runtime.

The route follows [official app-server authentication](https://developers.openai.com/codex/app-server/) and [credential-storage guidance](https://developers.openai.com/codex/auth/). Account checks read sanitized account/plan fields. Sign-in is explicit and stays in an owned process until completion, cancellation or timeout. Windows starts the version-checked native executable with a hidden window; it does not use the npm wrapper for background requests. Cancel sign-in closes the local protocol and waits for owned-process cleanup rather than waiting for a provider reply. A timeout gives a retry message. The read-only model check uses the existing tool-denying probe in a disposable directory and requires a fresh server-side ChatGPT account check plus explicit allowance confirmation. No automatic API-key fallback exists.

Automated account, quota and login results are simulated. Before accepting the product integration gate, the owner must install the pinned runtime, explicitly sign in on Windows, confirm OS credential-store use, run one opted-in read-only check and record the exact app commit and result in its PR. Do not treat earlier Phase 0 results as verification of this new profile or UI. No new model run or authorization occurs on app launch.

Do not point test overrides at real data. Do not commit databases, credentials, local config or logs.

### Deliberate migration trials

Ordinary review never copies everyday data. Prefer synthetic fixtures for migration checks. If a copy is explicitly needed, close every app using its source, preserve that source and its backups, and copy to a new trial directory before opening the candidate build. Use SQLite's verified snapshot tooling for live/WAL data; copying only tracker.db while it is open is not a consistent backup.

For a verified snapshot, run restore-snapshot.ts below with a new destination at %LOCALAPPDATA%\FocusFlow\reviews\migration-trial\schema-N\data\tracker.db, using the candidate build's format for N. Then open --review migration-trial. Only the explicit copy is upgraded and it gets its own pre-upgrade snapshot. Retain the original snapshot and manifest. Do not put a newer database into an older format's directory; older builds keep using their separate data. Builds predating review mode need their existing disposable-test override rather than an unrecognized --review argument.

## Backup and recovery

Format 9 appends coding intent and optional immutable publication identity in a separate table without rebuilding existing tasks. Existing tickets remain Manual. Format 8 added four ticket statuses with independent blocker notices. Old Ready becomes Backlog; old Blocked becomes Backlog with a manual reason that remains until explicitly cleared. Upgrades retain prerequisite links and take the normal verified pre-change snapshot. Published draft-storage format 7 remains compatible. Named review/development profiles use separate directories for the running database format, without copying, resetting or deleting earlier sample data. Use a new review name for fresh examples; reopen the same name and format to retain edits.

Existing product schema changes take a verified snapshot before transactional migration. Schema 5 adds weekday selection while retaining Personal/project data and existing weekly periods. Append migrations; do not rewrite an applied migration. A fresh database needs no pre-upgrade snapshot.

To restore a snapshot manually, close all app instances and preserve the original database plus any WAL/SHM sidecars. Keep the snapshot and matching .db.json manifest together, then run:

~~~powershell
node scripts/restore-snapshot.ts BACKUP_DB NEW_DATABASE_PATH
~~~

The destination must be new. The helper verifies checksum, integrity and schema, and refuses existing files/sidecars. Use a compatible app with the restored data; later edits remain in the preserved original database.

This is developer recovery tooling, not an automatic updater or user recovery UI.

## Checks before review

- Remove superseded code and update its callers, tests, commands and docs. Keep migrations, compatibility behavior and tools that are still used; check references before deleting them.
- During this owner-authorized implementation batch, do not run automated tests, the native app, live models or packaging. Static language/compiler inspection may be recorded separately. The owner builds and tests through Start-FocusFlow.cmd. Retained verification commands are available for later acceptance.
- Give an exact build or launch command and data profile for app changes. State any missing review setup rather than claiming data isolation that has not been implemented. For documentation changes, link the changed documents and explain what to inspect.
- Record executed checks, failures, unverified behavior and the tested commit in the PR. Label owner-reported results, code observations and inference separately. Keep implementation details in the PR's expandable notes.
- After the owner merges, confirm the merge and update affected Issues/overviews. Leave temporary PR status out of stable documents.

Verification workflows are currently workflow_dispatch only. No PR/main push starts tests or packaging. If manually enabled later, standard hosted Windows/Linux jobs require a public repository; private-repository jobs are skipped. Existing concurrency rules, real failure reporting and no persistent uploads/caches are retained.

Installed task, review and synthetic prior-schema recovery checks use the same disposable installation in one job. Recovery still requires earlier steps to pass. This avoids transferring an installer through artifact storage. Real failures still fail the job; existing native-close failures are not suppressed.

CI does not upload installers, screenshots, reports or dependency caches. Result/failure reports are printed in run logs; screenshots and installer files exist only on the disposable runner. The scripts still produce local files when run by a developer. Distribution tooling is historical and outside the personal-use scope; historical artifacts remain subject to their existing expiration dates.

### Personal account controls

Repository workflow edits do not change personal GitHub email delivery or billing budgets. At [notification settings](https://github.com/settings/notifications), under System / Actions, turn off Email and use On GitHub if desired. At [billing settings](https://github.com/settings/billing), open Budgets and alerts, set a zero paid-usage Actions budget and enable Stop usage when budget limit is reached. A budget that only sends alerts does not stop paid usage. These are owner account settings and must be checked directly; a PR is not proof that either setting changed.

Existing retained artifacts are not deleted by this change. Use the repository Actions pages to inspect or remove unwanted old artifacts if needed. Prior accrued storage is not erased by deleting files. See [GitHub budget controls](https://docs.github.com/en/billing/how-tos/set-up-budgets) and [Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions).

Tests never use a live model, authenticated GitHub writes or real personal data. Keep evidence tied to the reviewed commit. See [validation](VALIDATION.md) and [Codex commands](CODEX.md).

## When a check fails

Before retrying, record the observed failure, the hypothesis to test, one controlled experiment, its expected result and a stopping condition in the PR or relevant Issue. Record the actual result before choosing another step. A retry passing is evidence of that run, not an explanation of the earlier failure.

After a native crash, stop repeated launches. Preserve user data and directory permissions. Do not delete the personal database, reset project permissions or disable the sandbox as a routine diagnostic step. The temporary Electron-path workaround does not establish a permanent fix. [Task #73](https://github.com/gh01wzx/focusflow/issues/73) holds the startup observations and remaining diagnostic work.

## GitHub product connection

See [GitHub connection](GITHUB_CONNECTION.md) for the authorization comparison, owner setup and disposable review steps. Review profile credentials are separate from everyday credentials. Connecting alone performs no repository writes.

## Historical distribution tooling

Old packaging scripts and the [release-route experiment](RELEASE_ROUTE.md) remain for their historical consumers and evidence. They are not part of personal-use acceptance and must not introduce installer/update work, paid services or release gates. Source-run data migration snapshots and separate-path recovery remain in scope.
