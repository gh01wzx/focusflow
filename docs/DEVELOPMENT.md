# Development

Use Node.js 24.12 or a later 24.x version. Install exact dependencies with `npm ci`. Open the app from source with `Start-FocusFlow.cmd` on Windows or `./Start-FocusFlow.command` on Mac. Packaging, distribution and app updates are outside the personal-use scope.

## Where information belongs

| Information | Location |
| --- | --- |
| Launch and everyday use | [README](../README.md) and [Usage](USAGE.md) |
| Product decisions and code layout | [Product baseline](PRODUCT_BASELINE.md) and [Architecture](ARCHITECTURE.md) |
| Data paths, commands and recovery | This document |
| Collaboration rules | [AGENTS.md](../AGENTS.md) |
| Work to do and owner acceptance | GitHub Issues, including [Windows acceptance](https://github.com/gh01wzx/focusflow/issues/68) |
| Results for a change, known failures and development history | Its pull request and Git history |

## Tasks and PRs

Use the [task template](../.github/ISSUE_TEMPLATE/task.md) and [PR template](../.github/pull_request_template.md). Use the assigned Issue number in the branch and PR title. Explain the user-facing change, how to try the proposed build and what remains unverified. Record the exact revision and profile for each observed result.

## Commands

| Command | Purpose |
| --- | --- |
| `Start-FocusFlow.cmd` / `./Start-FocusFlow.command` | Open the everyday app, rebuilding first only when the source or dependencies changed since the last successful launcher build |
| Add `--review NAME` to either launcher | Build and open a named, separate workspace |
| `npm start` / `npm run start:web` | Open a development workspace in Electron or a browser |
| `npm run typecheck` | Check module boundaries and compile all TypeScript without writing output |
| `npm run check:language` | Check maintained source and documentation language |
| `npm run build` | Always rebuild the ignored `dist` directory |
| `npm run diagnose:desktop` | Try the built desktop runtime once without opening task data |
| `npm run ai:install` | Install the pinned Codex runtime before first use |
| `npm test` / `npm run test:source` | Run compiled tests or source tests in disposable folders, never against everyday data or a running app's build |
| `npm run codex:write-trial -- --sandbox-only` | Check a disposable Windows write using the existing trial setup without a model |

Use [Codex commands](CODEX.md) for runtime diagnostics and [GitHub connection](GITHUB_CONNECTION.md) for authorization. GitHub verification workflows are manual-only. With owner authorization, select **Desktop checks > mac-source** to open a fresh review workspace on a standard public macOS runner. It records native window readiness, the selected database and preview shutdown. Tests use disposable storage, simulated providers and no personal data. Record build checks, hosted results, Windows owner acceptance and live provider evidence separately.

## Data paths

The root is `%LOCALAPPDATA%\FocusFlow` on Windows and `~/Library/Application Support/FocusFlow` on Mac.

| Launch | Directory under the platform root |
| --- | --- |
| Platform launcher or source with `--personal` | `desktop` |
| `npm start` or browser development default | `workspaces/development/CHECKOUT_ID/schema-N` |
| `--review NAME` | `workspaces/reviews/NAME/schema-N` |

Each directory stores `data/tracker.db` and its own connection settings. The everyday profile can keep its `data` folder elsewhere; `data-location.json` in the profile records that folder, and launch uses it only while its `tracker.db` exists. The development ID comes from the checkout path. A named workspace is shared across checkouts that use the same name and format. Open another name for a fresh workspace. Previous `development` and `reviews` folders stay on disk. Launch uses the current paths in the table.

`FOCUSFLOW_TEST_PROFILE` overrides the desktop test directory. The browser development service accepts `FOCUSFLOW_DATA_DIR`. Use disposable directories for these overrides. The desktop rejects combinations of test, personal and review modes that would make the selected directory ambiguous.

The selected profile also keeps `coding-workspaces\TICKET_ID`, run records, preview receipts and publication journals. Opening the app reconciles persisted state. It does not start another model turn or approve a pending write.

## Backup and recovery

Migrations take a verified snapshot of recognised existing data before changing its schema. FocusFlow also makes one verified `daily-` snapshot each local day, a few seconds after opening or hourly while it stays open, and keeps the newest 30. Backups are stored beside the database in `backups`; a folder chosen in **Settings > Backups and export** receives a copy of each daily snapshot. Exports go to `exports` in the profile folder. Append migrations without changing already-applied SQL.

Close the app and retain the original database and any WAL/SHM sidecars. Keep a snapshot and its matching `.db.json` manifest together. Restore to a **new** destination:

~~~powershell
node scripts/restore-snapshot.ts BACKUP_DB NEW_DATABASE_PATH
~~~

The helper checks the manifest, checksum, schema and SQLite integrity. For a deliberate migration check, restore to a new review destination such as `%LOCALAPPDATA%\FocusFlow\workspaces\reviews\migration-trial\schema-N\data\tracker.db`, then open `Start-FocusFlow.cmd --review migration-trial` using the candidate build. Keep the source snapshot and use the app version compatible with its format.

Source, committed files and diagnostics must exclude real databases, credentials, private configuration and raw execution logs.
