# FocusFlow

A Windows desktop task tracker built with TypeScript, React, Electron and SQLite. Data stays on your computer; no Tracker account is required.

**Status:** Today and repeating tasks are merged. Task #24 reorganizes the existing code for review; it adds no feature. This is an unsigned development build, not the complete MVP.

## Available now

- Add temporary tasks with a planned date, defaulting to today.
- Complete or cancel tasks; keep their records in History.
- See due/overdue tasks in Today and future tasks in Upcoming.
- Keep tasks across restarts, with original planned dates.
- Choose daily/weekly repetition, retain missed periods in History and stop future repeats.

Editing/reopening, Projects, AI planning, coding/review and one-click updates are not implemented.

## Repeating tasks

Choose **Repeat** and a first date of today or later. Daily tasks reset at local midnight. Weekly tasks last seven calendar days from their first date, including that date.

Completing/cancelling affects one occurrence. Unfinished periods become **Missed** in History; reopening catches up closed-app periods without overdue accumulation. Temporary tasks keep their original dates and stay pending.

Expand **Repeating tasks** to stop a schedule. Its current-period task stays available; a future first occurrence is cancelled. History is retained. Upcoming shows the first scheduled task, not an infinite preview.

## Run on Windows

Install Node 24.12.x or a later 24.x release. In the project folder, run:

~~~powershell
npm ci
.\Start-FocusFlow.cmd
~~~

Run npm ci again when dependencies change. After setup, double-click Start-FocusFlow.cmd. The source launcher builds the app and keeps its console open. Electron downloads its pinned runtime on first use.

For an unsigned installer, open the passing **Windows desktop checks** run and download **windows-today**. Check the run result before using its artifact. The installer bundles Node/Electron; it does not provide automatic updates.

## Local data

The Windows product database is at:

~~~text
%LOCALAPPDATA%\FocusFlow\desktop\data\tracker.db
~~~

It is outside source and installation output. The app does not import the old Phase 0 notes or access the separate Codex login profile. No task data is sent to GitHub or an AI service.

## Read the project

| Document | Purpose |
| --- | --- |
| [Architecture](docs/ARCHITECTURE.md) | Components, request flow and code-reading order |
| [Development](docs/DEVELOPMENT.md) | Build, tests, data paths and recovery |
| [Product baseline](docs/PRODUCT_BASELINE.md) | Approved MVP requirements |
| [Roadmap](docs/ROADMAP.md) | What is implemented and what remains |
| [Validation](docs/VALIDATION.md) | Evidence and known limitations |
| [Codex commands](docs/CODEX.md) | Optional standalone integration checks |

Source, app text and repository documentation use English. User-entered content keeps its original language.
