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
| npm start | Clean/build and open the desktop app |
| npm run start:web | Open the same task service in a browser |
| npm run check:language | Check maintained source/docs for accidental Han-script text |
| npm run typecheck | Dependency boundaries plus strict Node, browser, desktop and tooling checks |
| npm run check:boundaries | Static module boundaries, unresolved imports and runtime cycles |
| npm run build | Clean ignored dist output, compile TypeScript and bundle assets |
| npm test | Run compiled tests |
| npm run test:source | Optional Node type-stripping execution; not a type check |
| npm run package:windows | Build an unsigned NSIS installer; publication is disabled |

The launcher is Start-FocusFlow.cmd. Run npm ci again when dependencies change. The installed app bundles its runtime.

## Source and generated files

[Architecture](ARCHITECTURE.md) maps the folders and the code-reading path. Source lives in public and src; scripts prepare or check the app; test contains automated scenarios. Generated dist files and installer output are ignored by Git.

The build removes only the validated project dist directory before compiling. Deleted source files therefore cannot survive as stale compiled code.

## Data paths

- Product profile: %LOCALAPPDATA%\FocusFlow\desktop
- Product database: data\tracker.db within that profile.
- FOCUSFLOW_DATA_DIR explicitly overrides browser-development data.
- FOCUSFLOW_TEST_PROFILE selects a disposable desktop-test profile.
- Previous spike data and the separate Codex profile are never imported or deleted by source cleanup.

The source desktop launcher and installed app currently share the default product profile. A fresh checkout does not create fresh personal data. [Task #72](https://github.com/gh01wzx/focusflow/issues/72) tracks a separate review setup; it is not available yet. Identify any explicitly selected disposable profile in review instructions and verify that the chosen launcher honors it before use.

Do not point test overrides at real data. Do not commit databases, credentials, local config or logs.

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
