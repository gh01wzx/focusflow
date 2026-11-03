# FocusFlow — Personal & Projects Tracker

Windows-first, local-first personal tasks and project delivery, with a planned Codex → GitHub PR → human review workflow.

**Status: Phase 0 feasibility spike. Not a usable task tracker yet.** The owner has approved desktop development. The [public repository](https://github.com/gh01wzx/focusflow) and GitHub access are verified; this change imports the local experiment for review. Authenticated AI execution, installation packages and the updater remain unverified.

## Run on Windows

Prerequisite for this spike: Node.js **24.12.x or a later 24.x release**. Run `npm ci` once to install the pinned development compiler and Node type definitions. No API key is required. The installed desktop product will have a separate end-user setup flow.

1. Double-click `Start-FocusFlow.cmd`.
2. A browser page opens. Keep the console window open while using it.
3. Save test text, stop the app with Ctrl+C, reopen, and confirm it persists.
4. Create a backup of the last saved value using the second button.

If automatic browser opening fails, open the `http://127.0.0.1:...` URL printed in the console. The server uses an OS-assigned port and listens only on IPv4 loopback. This is a development launcher, not the proposed installed desktop experience. Multiple launches are not yet deduplicated.

```powershell
npm ci
npm run typecheck
npm run build
npm test
npm start
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

Runtime code uses Node's built-in HTTP server, `node:sqlite` and test runner, with no third-party runtime packages. TypeScript and Node type definitions are development dependencies. `node:sqlite` is experimental in the tested Node 24.12.0 runtime; this is not a final database-driver commitment. The approved desktop direction is Electron + TypeScript/React + SQLite + a Codex app-server adapter; see [architecture decisions](docs/ADR-001.md) for the version, driver and packaging checks still needed.

```text
public/   Browser UI for the persistence experiment
src/      HTTP adapter and versioned SQLite store
scripts/  Non-mutating integration probes
test/     Real database and local HTTP integration checks
docs/     Requirements baseline, decisions, evidence, proposed Tickets
```

## Data and credentials

Spike-only data is stored in `.phase0/data/` relative to the project directory (the double-click launcher fixes the working directory). `FOCUSFLOW_DATA_DIR` can point to a different test directory. Do not use this experiment to store private tasks. The installed product will use a stable user-data path outside source and installation directories; that behavior is not implemented here.

SQLite snapshots use its backup API, including committed WAL data. They are not a complete update rollback mechanism. Stop all app instances before manual recovery; preserve the original database and its WAL/SHM files together, then restore a verified snapshot into a separate empty directory and launch with that directory. Do not overwrite a live database. The automated recovery experiment uses disposable databases only.

Personal data, credentials, local configuration, logs and release output are ignored by default. No token belongs in a Ticket, commit, screenshot or archive. The repository is public; the user's data remains local. The included CI workflow runs tests on Windows and Linux; the PR's Checks panel reports hosted results separately from the local results in the Phase 0 report.

## Product direction

Personal: Today, recurring tasks, dated temporary tasks and history. Projects: Project → Milestone → Ticket, action center, manual workflows, reviewed AI planning, individually started Codex runs, evidence-based AI review, and completion only after confirmed merge. Formal releases will be separately built and updated while preserving data.

See [requirements baseline](docs/PRODUCT_BASELINE.md) and [proposed Tickets](docs/NEXT_TICKETS.md). Product screenshots and the full installation/update guide will accompany the first functional release; the current test page is not the product UI.
