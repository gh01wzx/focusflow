# Development

Prerequisite: Node 24.12.x or later 24.x. Install exact dependencies with npm ci.

## Where information belongs

| Content | Main location |
| --- | --- |
| Planned work and task status | GitHub Issues, starting at the [MVP task index](https://github.com/gh01wzx/focusflow/issues/28) |
| Current use and launch instructions | [README](../README.md) |
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
| npm run typecheck | Dependency boundaries plus strict Node, browser, desktop and tooling checks |
| npm run check:boundaries | Static module boundaries, unresolved imports and runtime cycles |
| npm run build | Clean ignored dist output, compile TypeScript and bundle assets |
| npm test | Run compiled tests |
| npm run test:source | Optional Node type-stripping execution; not a type check |
| npm run package:windows | Build an unsigned NSIS installer; publication is disabled |

Start-FocusFlow.cmd opens development data. Review-FocusFlow.cmd pr-72 opens a named review. Run npm ci again when dependencies change. The installed app bundles its runtime and accepts --review pr-72 without Node or npm.

## Source and generated files

[Architecture](ARCHITECTURE.md) maps the folders and the code-reading path. Source lives in public and src; scripts prepare or check the app; test contains automated scenarios. Generated dist files and installer output are ignored by Git.

The build removes only the validated project dist directory before compiling. Deleted source files therefore cannot survive as stale compiled code.

## Data paths

| Launch | Directory under %LOCALAPPDATA%\FocusFlow |
| --- | --- |
| Installed app, no review argument | desktop |
| Source desktop/browser default | development\CHECKOUT_ID\schema-N |
| Source or installed --review pr-72 | reviews\pr-72\schema-N |

Each directory contains data\tracker.db. N is the running build's database format; CHECKOUT_ID is a stable hash of the source directory. Reopening the same directory/name and format keeps changes. Named reviews can be reopened from another checkout; use a distinct name for each PR or independent trial. A schema change opens a separate sample workspace. No automatic import, reset or deletion occurs.

Development/review windows show a sample-data notice and title. Examples are added only when creating a database; reopening an existing database, including a deliberate migration copy, does not add examples. First-time examples are written in one transaction. A failed initial seed fails startup without partial examples; it does not delete the new database. Use a new review name for a fresh trial after investigating that failure.

Explicit developer overrides remain available for existing tools: FOCUSFLOW_TEST_PROFILE selects a desktop-test directory, and FOCUSFLOW_DATA_DIR selects browser-service data directly. Neither seeds examples. Clear FOCUSFLOW_TEST_PROFILE before using --review; a conflict is refused. Browser review mode ignores FOCUSFLOW_DATA_DIR and uses the named review. These overrides are not everyday/review launch instructions.

Previous spike data and the separate Codex profile are never imported or deleted by source cleanup. Installed everyday data stays in its original location; source launchers no longer open it by default.

Do not point test overrides at real data. Do not commit databases, credentials, local config or logs.

### Deliberate migration trials

Ordinary review never copies everyday data. Prefer synthetic fixtures for migration checks. If a copy is explicitly needed, close every app using its source, preserve that source and its backups, and copy to a new trial directory before opening the candidate build. Use SQLite's verified snapshot tooling for live/WAL data; copying only tracker.db while it is open is not a consistent backup.

For a verified snapshot, run restore-snapshot.ts below with a new destination at %LOCALAPPDATA%\FocusFlow\reviews\migration-trial\schema-N\data\tracker.db, using the candidate build's format for N. Then open --review migration-trial. Only the explicit copy is upgraded and it gets its own pre-upgrade snapshot. Retain the original snapshot and manifest. Do not put a newer database into an older format's directory; older builds keep using their separate data. Builds predating review mode need their existing disposable-test override rather than an unrecognized --review argument.

## Backup and recovery

Existing product schema changes take a verified snapshot before transactional migration. Schema 5 adds weekday selection while retaining Personal/project data and existing weekly periods. Append migrations; do not rewrite an applied migration. A fresh database needs no pre-upgrade snapshot.

To restore a snapshot manually, close all app instances and preserve the original database plus any WAL/SHM sidecars. Keep the snapshot and matching .db.json manifest together, then run:

~~~powershell
node scripts/restore-snapshot.ts BACKUP_DB NEW_DATABASE_PATH
~~~

The destination must be new. The helper verifies checksum, integrity and schema, and refuses existing files/sidecars. Use a compatible app with the restored data; later edits remain in the preserved original database.

This is developer recovery tooling, not an automatic updater or user recovery UI.

## Checks before review

- Remove superseded code and update its callers, tests, commands and docs. Keep migrations, compatibility behavior and tools that are still used; check references before deleting them.
- For code changes, run npm run check:language, npm run typecheck, npm run build and npm test. For documentation-only changes, run the language check, check Markdown links and read the templates as an owner would. Documentation review does not require a local Electron launch.
- Give an exact build or launch command and data profile for app changes. State any missing review setup rather than claiming data isolation that has not been implemented. For documentation changes, link the changed documents and explain what to inspect.
- Record executed checks, failures, unverified behavior and the tested commit in the PR. Label owner-reported results, code observations and inference separately. Keep implementation details in the PR's expandable notes.
- After the owner merges, confirm the merge and update affected Issues/overviews. Leave temporary PR status out of stable documents.

CI repeats cross-platform checks and operates an installed Windows app, including restart and synthetic prior-schema recovery. Existing workflows also run for documentation pushes; their results still belong to the tested commit.

Tests never use a live model, authenticated GitHub writes or real personal data. Keep evidence tied to the reviewed commit. See [validation](VALIDATION.md) and [Codex commands](CODEX.md).

## When a check fails

Before retrying, record the observed failure, the hypothesis to test, one controlled experiment, its expected result and a stopping condition in the PR or relevant Issue. Record the actual result before choosing another step. A retry passing is evidence of that run, not an explanation of the earlier failure.

After a native crash, stop repeated launches. Preserve user data and directory permissions. Do not delete the personal database, reset project permissions or disable the sandbox as a routine diagnostic step. The temporary Electron-path workaround does not establish a permanent fix. [Task #73](https://github.com/gh01wzx/focusflow/issues/73) holds the startup observations and remaining diagnostic work.
