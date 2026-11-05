# Development

Prerequisite: Node 24.12.x or later 24.x. Install exact dependencies with npm ci.

## Tickets and PRs

Use the Issue number as the task ID from task 21 onward. Issue and PR titles share [ID] plus a plain-English user outcome; the branch starts with the same ID. Example: [21] Create tasks that repeat daily or weekly, on branch 21-repeat-daily-or-weekly. GitHub assigns a separate, immutable PR number; it is not another task ID.

Describe the user's need and acceptance steps they can try in the app. A PR starts with what changed for the user, how to try it, and verification/limitations. Put database, protocol and implementation details in expandable engineering notes. For maintenance, explain the user impact before the mechanism.

Link the Issue with Closes #ID. Passing checks means ready for review; only an observed merge completes the coding Ticket. Replacing a PR or renaming a branch never counts as completion.

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

## Layout

| Directory | Contents |
| --- | --- |
| public/today | React interface and readable source styles |
| src/shared | Browser-safe contracts, codecs and calendar helpers |
| src/client | Typed browser API client |
| src/http | Local server lifecycle and request checks |
| src/tasks | Personal service/rules, routes and repository |
| src/projects | Manual hierarchy service, validation, routes and repository |
| src/workspace | Shared database ownership and HTTP composition |
| src/desktop | Electron window and lifecycle |
| src/database | Shared schema/connection, migrations and backup/recovery |
| src/codex | Standalone integration groundwork |
| scripts | Build, explicit verification and recovery tools |
| test | Disposable calendar, storage, API and protocol tests |

Build scripts remove only the validated project dist directory. This prevents deleted source tests/modules surviving as stale compiled output.

## Data paths

- Product profile: %LOCALAPPDATA%\FocusFlow\desktop
- Product database: data\tracker.db within that profile.
- FOCUSFLOW_DATA_DIR explicitly overrides browser-development data.
- FOCUSFLOW_TEST_PROFILE selects a disposable desktop-test profile.
- Previous spike data and the separate Codex profile are never imported or deleted by source cleanup.

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

Run language, typecheck, build and test commands. CI repeats cross-platform checks and operates an installed Windows app, including restart and synthetic prior-schema recovery.

Tests never use a live model, authenticated GitHub writes or real personal data. Keep evidence tied to the reviewed commit. See [validation](VALIDATION.md) and [Codex commands](CODEX.md).
