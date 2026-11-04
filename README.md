# FocusFlow

A Windows-first, local-first personal task and project tracker. TypeScript, React, Electron and SQLite. No Tracker account is required.

**Status: Phase 1 development.** The first Today slice supports dated temporary tasks; this is not the complete MVP or a signed formal release. Recurrence, Projects, AI planning, the coding/review loop and one-click updates are still future work.

## Use Today

- Add a task and a planned date, defaulting to today.
- Check it to complete it, or cancel it. Both remain in History.
- Today keeps overdue pending tasks with their original planned dates; Upcoming holds future tasks.
- Tasks persist on this computer across restarts. Titles retain the language entered by the user.

The page refreshes its local calendar date on focus and periodically while visible. Today uses the computer's local calendar, not a UTC date slice. There is no recurrence, edit/reopen control or automatic reminder in this first slice.

## Run from source on Windows

Install Node **24.12.x or a later 24.x release**, then run once after downloading/updating source dependencies:

```powershell
npm ci
```

Double-click `Start-FocusFlow.cmd`, or run `npm start`. The launcher builds the renderer before opening the desktop window. Electron's official launcher downloads its pinned binary on first use; later launches reuse it. The source console stays open while the app runs. The packaged app bundles its runtime.

The passing **Windows desktop checks** workflow provides a `windows-today` artifact with an unsigned development installer, screenshot and test report. Extract the artifact and run `FocusFlow-0.1.0-alpha.1-x64.exe`, then use the installed FocusFlow shortcut. Artifact availability alone is not a test pass; check the exact run conclusion. This is a development build, with no formal release/update channel. Signing and one-click updates remain Phase 4 work.

## Private local data

Desktop product profile: `%LOCALAPPDATA%\FocusFlow\desktop`. SQLite data: `data\tracker.db` under that profile. It is outside the source and installation directories. The installer preserves app data on uninstall. Product identity checks reject an unrelated database rather than treating it as task data.

The prior Phase 0 note experiment remains separate at `%APPDATA%\FocusFlow\phase0-desktop` (desktop) or `.phase0/data/` (browser spike). Its notes are not imported or overwritten. The dedicated Codex profile remains separate at `%LOCALAPPDATA%\FocusFlow\codex-phase0`; the Today app does not access it or call a model. Personal tasks are not sent to GitHub or any AI service.

For a browser development session, `npm run start:web` uses the product data path. `FOCUSFLOW_DATA_DIR` can explicitly select another development data directory. Avoid running multiple source sessions against the same data while testing migrations. `npm run start:spike:web` opens the preserved persistence experiment instead. Test automation uses disposable directories and `FOCUSFLOW_TEST_PROFILE`, never the normal profile.

Database migrations take a verified pre-upgrade snapshot and run transactionally. Newer product schemas and unrelated databases are refused. The test suite exercises a **synthetic prior product schema** and separate snapshot recovery; no historic product release is fabricated. The old two-installer Phase 0 result remains historical evidence, not a claim that Phase 0 notes are upgraded into tasks. Recovery tooling is developer-facing; a user recovery/update UI is not implemented.

Never commit databases, credentials, local config, logs or installer output. Source is public at [gh01wzx/focusflow](https://github.com/gh01wzx/focusflow); personal data stays local.

## Architecture and verification

```text
public/today/   React/TypeScript Today UI and static styles
src/tasks/     Task validation, SQLite store and loopback HTTP API
src/desktop/   Sandboxed Electron window, profile and lifecycle
src/database/  Verified snapshots, restoration and transactional migrations
src/codex/     Separately verified protocol client; not invoked by Today
scripts/       Build, explicit probes and disposable installed-app checks
test/          Calendar, storage, HTTP, migration and protocol tests
docs/          Product baseline, decisions and evidence ledger
```

The renderer has no Node/credential access or preload bridge. Its service listens only on IPv4 loopback, rejects wrong Host/Origin and oversized writes, and serves a restrictive CSP. React escapes task text; all renderer assets are bundled locally, with no CDN or remote font dependency. Source stays strict TypeScript; generated JavaScript is ignored build output. React 19.3.1, matching React DOM, type declarations and esbuild are exactly pinned in the lockfile.

```powershell
npm run check:language
npm run typecheck
npm run build
npm test
npm run package:windows
```

Windows/Linux checks run real SQLite/HTTP/calendar tests and controlled protocol fixtures. Windows packaging checks operate the installed Today UI, restart it, verify renderer isolation and test product schema migration/recovery. Smoke checks have stage output and bounded launch/locator/close waits. No live model or authenticated GitHub write belongs to ordinary tests. Check the exact PR head's CI results for hosted evidence. Dependency audit findings are retained as diagnostics, not presented as a clean security result.

## Roadmap

The owner-approved [Phase 0 handoff](docs/PHASE0_REPORT.md) permits local Personal/manual Projects through small, individually started Tickets. Next slices include recurrence and manual Projects/action center. Product-owned GitHub authorization, reviewed AI planning and controlled Codex coding/review come later, followed by verified formal releases/updates. Coding Tickets become Done only after an observed PR merge.

The [Codex probe guide](docs/CODEX_VERIFICATION.md) records owner-reported real streaming and cancellation with ChatGPT login. This does not establish the future code-writing sandbox, product authorization or independent review workflow. No existing Codex App session is controlled.

Application/source/documentation and GitHub development records use English. User-entered data keeps its original language. Screenshots and reports in CI artifacts use disposable test data.
