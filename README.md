# FocusFlow — Personal & Projects Tracker

Windows-first, local-first personal tasks and project delivery, with a planned Codex → GitHub PR → human review workflow.

**Status: Phase 0 feasibility spike. Not a usable task tracker yet.** The [public repository](https://github.com/gh01wzx/focusflow) contains the local persistence experiment and an experimental Windows desktop packaging workflow. Check the exact PR's CI result before using an artifact. Authenticated AI execution and updating remain unverified.

## Run on Windows

Prerequisite for source development: Node.js **24.12.x or a later 24.x release**. Run `npm ci` once to install the pinned compiler, Electron launcher package and development tools. Electron 45 downloads its binary on first use, so a successful `npm ci` does not need to create `node_modules/electron/dist/electron.exe`. The first `npm start` can take longer while the official loader downloads and verifies the runtime; subsequent starts reuse it. No API key is required. The experimental installer already bundles its runtime and has a separate setup flow.

1. Double-click `Start-FocusFlow.cmd`.
2. The experiment opens in a desktop window. Keep the development console open while using it.
3. Save test text, stop the app with Ctrl+C, reopen, and confirm it persists.
4. Create a backup of the last saved value using the second button.

The development launcher requires the installed compiler and Electron runtime. For the browser-only experiment, run `npm run start:web` and use the printed local URL. It listens only on IPv4 loopback. The desktop shell adds a single-instance lifecycle and a separate profile outside source/install directories. The unsigned installer and its limits are described in the [desktop experiment guide](docs/DESKTOP_EXPERIMENT.md).

```powershell
npm ci
npm run typecheck
npm run build
npm test
npm start
npm run start:web
npm run package:windows
node scripts/probe-codex.ts 'ABSOLUTE_PATH_TO_CODEX_EXE'
npm run probe:github
```

Codex discovery is intentionally explicit. The transport probe launches a separate process in a temporary isolated Codex home, sends only `initialize`/`initialized`, then stops it. It does not log in, invoke a model, inspect tokens, or attach to a running Codex conversation. Public GitHub probes send only unauthenticated GET requests; failure is reported honestly.

## What this spike proves

- A local browser UI backed by real SQLite persistence.
- Online database backup, integrity checking and restoration into a separate test database.
- Refusal to open a newer schema with an older binary.
- A reproducible Codex stdio handshake experiment, distinct from authenticated execution.
- A read-only GitHub connectivity probe, distinct from Issue/PR write integration.

Current Windows test results and limitations: [Phase 0 report](docs/PHASE0_REPORT.md).

## Architecture

The spike uses **TypeScript throughout application, browser, probes and tests**, with strict checks and separate Node/browser compiler configurations. TypeScript emits JavaScript into ignored `dist/`; browser HTML/CSS assets are copied alongside it. `npm start` builds before launching. `npm test` runs the built tests; `npm run test:source` additionally exercises erasable TypeScript directly on Node 24 and does not perform type checking.

The Electron shell hosts Node's built-in HTTP server and `node:sqlite`, with no third-party database driver or production npm dependency. Electron, its packager, Playwright, TypeScript and Node type definitions are pinned development dependencies. `node:sqlite` is experimental in the original Node 24.12.0 spike; bundled compatibility is verified separately for the desktop runtime. The approved product direction remains Electron + TypeScript/React + SQLite + a Codex app-server adapter; see [architecture decisions](docs/ADR-001.md) for the remaining integration/update gates.

```text
public/   Browser UI for the persistence experiment
src/      HTTP adapter and versioned SQLite store
scripts/  Non-mutating integration probes
test/     Real database and local HTTP integration checks
docs/     Requirements baseline, decisions, evidence, proposed Tickets
```

## Data and credentials

Browser-spike data is stored in `.phase0/data/` relative to the project directory; `FOCUSFLOW_DATA_DIR` can select another browser test directory. The desktop experiment uses `%APPDATA%\FocusFlow\phase0-desktop\data\phase0.db`, outside the source/installation directories. Its disposable smoke profile uses the explicit `FOCUSFLOW_DESKTOP_TEST_DATA_DIR` override. The two experiments do not import each other's data. Do not use this experiment to store private tasks.

SQLite snapshots use its backup API, including committed WAL data. They are not a complete update rollback mechanism. Stop all app instances before manual recovery; preserve the original database and its WAL/SHM files together, then restore a verified snapshot into a separate empty directory and launch with that directory. Do not overwrite a live database. The automated recovery experiment uses disposable databases only.

Version 0.0.2 introduces schema 2 format metadata and transactional migrations. Existing data is snapshotted and verified before migration; failure rolls back the transaction. Recovery verifies the matching manifest and creates a new database without overwriting the original. The [manual upgrade/recovery guide](docs/UPGRADE_RECOVERY_EXPERIMENT.md) separates the two-installer test from automatic updates and production recovery, which remain unimplemented.

Personal data, credentials, local configuration, logs and release output are ignored by default. No token belongs in a Ticket, commit, screenshot or archive. The repository is public; the user's data remains local. The included CI workflow runs tests on Windows and Linux; the PR's Checks panel reports hosted results separately from the local results in the Phase 0 report.

## Product direction

The application, source comments, project documentation and GitHub development records use English. User-entered data keeps its original language. `npm run check:language` checks maintained source and documentation for accidental Han-script text; it does not inspect databases, credentials, dependencies or build output. Unicode persistence coverage uses escaped test fixtures.

Personal: Today, recurring tasks, dated temporary tasks and history. Projects: Project → Milestone → Ticket, action center, manual workflows, reviewed AI planning, individually started Codex runs, evidence-based AI review, and completion only after confirmed merge. Formal releases will be separately built and updated while preserving data.

See [requirements baseline](docs/PRODUCT_BASELINE.md) and [proposed Tickets](docs/NEXT_TICKETS.md). Product screenshots and the full installation/update guide will accompany the first functional release; the current test page is not the product UI.
