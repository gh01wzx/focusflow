# Development log

## 2026-11-03 — initial feasibility spike

- Established the user-supplied product brief as the baseline.
- Built a zero-dependency Windows local HTTP/SQLite experiment, not the product UI.
- Verified persistence across server restart, consistent backup and independent restoration, newer-schema refusal, and local HTTP boundaries with six tests.
- Verified an isolated Codex stdio initialization without a model turn, account access or attachment to an existing session.
- Unauthenticated public GitHub API requests were blocked by the execution environment's network restriction. No remote mutation occurred.
- Proposed a desktop application using Electron, TypeScript/React, SQLite and a separate Codex app-server integration. Concrete runtime/driver/packaging choices still need experiments.
- Owner explicitly approved the desktop direction and public repository destination `gh01wzx/focusflow`.
- Initialized local Git and prepared this honest import of the Phase 0 spike. GitHub account connection and public repository creation are pending. No historic Issues or PRs are invented.
- Re-ran all six tests successfully. The first staging attempt was blocked by filesystem permissions on `.git/index.lock`; no commit was created. No elevation or permission workaround was attempted.

## 2026-11-03 — public repository bootstrap

- The owner created the public repository with an initial README commit.
- The connected GitHub app confirms the expected account and repository access. The future Tracker app still needs its own integration and authorization.
- Bootstrap work is tracked in a real Issue and reviewed in a branch/PR. Local Git index writes remain restricted; the connected GitHub Git-data API publishes the reviewed source snapshot without changing local Git permissions.
- Private databases, helper scripts, logs and archives are excluded from the source snapshot. A hosted CI run is distinct from the six passing local tests.

Next gate: review/merge of the bootstrap PR, followed by supported Codex/runtime and Windows packaging feasibility checks. Product features are still unimplemented.

## 2026-11-03 — approved merge and TypeScript migration

- The owner approved PR #2, which merged as `3b62585449857675b2628e0bb5be66d2023a9828`. The linked bootstrap Issue #1 is complete.
- The owner requested TypeScript rather than JavaScript, and English-only PR descriptions. Both preferences are now recorded in the development rules.
- Issue #3 tracks migration of the application, browser, probes and tests, with strict checks and compiler output isolated in ignored `dist/`. The data location and schema remain version 1.
- Local npm registry access is blocked by the execution environment. Source-runtime tests can be run locally with Node 24; dependency installation, strict compilation and built tests are verified separately through GitHub CI. Runtime type stripping alone is not a compiler check.

## 2026-11-03 — TypeScript merge and English application text

- The owner approved PR #4, which merged as `ae1bc83d29bc926c20e3da2297d81fdc2bb51243`. TypeScript is now the application source language.
- The owner requested English for all software and repository material; only the conversation remains Chinese.
- Issue #5 tracks translation of UI/messages/documentation and a focused language check. Unicode persistence fixtures use escapes while retaining their runtime values. Existing user data is not translated or rewritten.

## 2026-11-03 — Windows shell and installer feasibility

- The owner manually merged PR #6 as `dc15beada26162e160c47d8ea9d2746afb32d902`, then explicitly asked to continue.
- Issue #7 starts the bounded P0-03a shell/installer slice. Codex authentication, two-version updates and failure recovery remain separate gates; no Phase 1 feature was started.
- The first Windows compatibility job verified Electron 45.2.1 with bundled Node 24.22.1 and SQLite 3.53.4. No extra native database driver is required for this pinned experiment.
- The desktop workflow builds an unsigned NSIS installer with publication disabled and checks the installed app in a disposable profile. The exact workflow result, smoke report and PR head determine what is verified; artifact existence is not proof of success.

## 2026-11-03 — first-launch regression

- The owner merged PR #8 as `5e92f0af3db98fa64560b077cd77e10b98737c86` and reproduced a source-launch failure after a successful `npm ci`.
- Electron 45.2.1's installed package has no binary-download postinstall script. Its official loader initializes the binary on first use; the Windows launcher's executable precheck prevented that normal path.
- The launcher now checks the installed CLI package and allows first-run initialization. Windows CI exercises a clean npm install followed by the official loader, and records dependency audit diagnostics without changing or force-upgrading the dependency tree.
