# Windows desktop packaging experiment

Status: Phase 0 feasibility work, not a formal release. The workflow result for the exact PR head is the verification authority.

## Scope and versions

- Electron 45.2.1: pinned official Windows runtime. The initial compatibility job observed Node 24.22.1 and SQLite 3.53.4, and successfully queried an in-memory database through `node:sqlite`.
- electron-builder 26.18.0: pinned maintained NSIS packaging tool, confirmed by the registry in the compatibility job. A newer GitHub release tag alone is not proof that its npm package is available.
- playwright-core 1.64.1: development-only automation for the installed app in a disposable Windows CI profile. It does not install a separate browser.
- All first-party source stays TypeScript. Runtime code has no third-party database driver or production npm dependency.

Node-only source keeps its own compiler configuration. Desktop/Electron and automation definitions also reference DOM types, so `tsconfig.desktop.json` checks that boundary with both Node and DOM libraries; strict checking stays enabled without skipping dependency declaration checks.

References checked on 2026-11-03: [Electron release](https://github.com/electron/electron/releases/tag/v45.2.1), [Electron security](https://www.electronjs.org/docs/latest/tutorial/security), [app lifecycle and paths](https://www.electronjs.org/docs/latest/api/app), [NSIS packaging](https://www.electron.build/nsis/), [Playwright release](https://github.com/microsoft/playwright/releases/tag/v1.64.1).

## Run and package

For development, run `npm ci` once, then double-click `Start-FocusFlow.cmd` or run `npm start`. The default opens an Electron window. `npm run start:web` preserves the browser-based spike. `npm run package:windows` builds the TypeScript source and an x64 NSIS installer in `release/`, with publication explicitly disabled.

For the packaged experiment, open the passing **Windows desktop feasibility** workflow run and download its `windows-desktop-experiment` artifact. Extract it, run `FocusFlow-Phase0-0.0.1-x64.exe`, then open the installed desktop/Start menu shortcut. This is an unsigned test installer. Windows reputation/security prompts may appear; do not disable system protections to run it. It is not offered as a signed production release.

The artifact also contains a screenshot and JSON evidence from an automated disposable profile when the smoke check succeeds. Failure artifacts may be uploaded too: artifact existence alone is not a passing test. Read the run conclusion and smoke report.

## Data and lifecycle

The desktop profile defaults to `%APPDATA%\FocusFlow\phase0-desktop`; the SQLite file is `data\phase0.db` below that directory. It is independent of installation path and version. The original browser spike keeps its separate `.phase0/data/` directory; no silent import occurs. The installer is per-user and is configured to preserve app data on uninstall.

`FOCUSFLOW_DESKTOP_TEST_DATA_DIR` explicitly overrides the profile only for disposable automation/development. Normal launch does not set it. Smoke tests create a temporary directory, verify the actual profile path and database, then remove only that validated temporary directory. Never point this override at real task data for an automated test.

The app uses a single-instance lock after selecting its profile. A second launch focuses the existing window. Normal quit stops the local service and closes SQLite. Abrupt Windows shutdown still relies on SQLite durability; it is not a tested update rollback strategy.

## Renderer boundary

The existing local HTTP experiment runs in the main process on IPv4 loopback with an OS-assigned port. The renderer has Node integration disabled, context isolation and sandboxing enabled, and no preload/IPC bridge. Existing Host/Origin/body-size checks and Content Security Policy remain. Navigation to other locations, new windows, permission requests and downloads are denied. This validates a small local shell, not future Codex/credential integration security.

## Evidence and remaining gates

The Windows job builds the installer, silently installs it in an isolated runner directory, and launches the installed executable. The smoke check loads the real renderer, verifies that Node globals are unavailable there, saves text, creates a verified database backup, checks that a second instance exits, closes the app and verifies the saved text after relaunch. It also checks that data lives outside installation output. The JSON report records the observed Electron/Node/SQLite versions.

This does not verify the owner's machine, SmartScreen behavior, signed distribution, version A-to-B upgrades, update feeds, failed-migration recovery, automatic rollback or authenticated integrations. P0-03a completes only the shell/installer slice of P0-03. The planned two-version update/recovery and signing decisions remain separate gates before Phase 1 and formal releases.
