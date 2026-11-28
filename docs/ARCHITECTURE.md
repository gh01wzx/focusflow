# Architecture

FocusFlow runs a React renderer, a loopback HTTP service and SQLite on the same computer. Electron selects the data profile before opening the service. The browser development entry uses the same service. The renderer receives state and submits checked requests through typed clients. Besides React, the renderer may use only the Motion animation library; the Inter interface font is copied from its package at build time and served by the local service.

## Code map

| Area | Entry points |
| --- | --- |
| Desktop and startup readiness | [Desktop entry](../src/desktop/main.ts), [tray](../src/desktop/tray.ts), [profile selection](../src/runtime/profile.ts), [startup checks](../src/runtime/startup.ts) |
| UI | [Workspace shell](../public/workspace/WorkspaceShell.tsx), [Personal](../public/today/TodayApp.tsx), [Projects](../public/projects/ProjectsApp.tsx) |
| Requests and composition | [Client modules](../src/client), [HTTP checks](../src/http/request.ts), [workspace service](../src/workspace/server.ts), [store composition](../src/workspace/store.ts) |
| Personal tasks, recurrence and points | [Tasks](../src/tasks), [calendar rules](../src/shared/calendar.ts), [habit rules](../src/shared/habits.ts) |
| Someday, goals and long-term history | [Someday](../src/tasks/someday.ts), [goals](../src/tasks/goals.ts), [history marks](../src/shared/history.ts) |
| Backups, export, start at login and reminders | [Data care](../src/workspace/care.ts), [export](../src/database/export.ts), [reminder checks](../public/workspace/useReminders.ts) |
| Project state and planning | [Projects](../src/projects), [plans](../src/plans), [dependency rules](../src/shared/dependencies.ts) |
| Coding, preview and review | [Execution](../src/execution), [Codex runtime](../src/codex), [provider adapters](../src/ai) |
| GitHub and linked work | [GitHub](../src/github), [publication](../src/publication), [comparison](../src/sync) |
| Database and recovery | [Database](../src/database), [recovery instructions](DEVELOPMENT.md#backup-and-recovery) |

## State and boundaries

UI components own drafts and visual state. A few Personal conveniences live only in the browser: the running timer, whether today was closed, the reviewed week and folded cards ([local state](../public/today/local-state.ts)); saved tasks, logs and focus are the record. Controllers load, save and reconcile through local clients. The HTTP service checks request origin, input and scope before calling domain services. Services own business rules and use typed repositories for SQL. Workspace composition passes one transaction into operations that must commit together.

The desktop confirms app readiness only after the renderer has loaded usable task data. Personal also waits up to two seconds for points, so the first screen does not shift after the window opens. Closing the window hides it to the tray or menu bar; Quit from the tray menu shuts the app down. Automated previews skip the tray and close normally. A blank window or stalled startup has a bounded failure path. Shutdown stops transport and owned services and drains accepted handlers before closing SQLite. The local service makes verified snapshots once a day or at quit, and serializes backups, exports and imports. An import is staged beside the data file and applied at the next start, before the database opens. For reminders it decides which habits are due; the renderer writes the text in the chosen language and the desktop shows it from the tray. A start at login passes `--background`, which keeps the window hidden after readiness. Everyday and review launches use separate directories. The everyday profile may keep its data folder elsewhere: moving makes a verified copy, keeps replaced data as a backup file and restarts the app on the new folder. Fresh databases start without example tasks or planning drafts.

Each Personal scoring rule also stores its habit plan: cue, time, place, two-minute version, pairing and identity, plus optional check-in and maintain amounts on the way to the target. A goal bonus is an earned entry with no minutes and no rate. Personal recurrence follows the local calendar. Month-based schedules (repeating tasks only) keep the day of month they start on, falling on the last day of shorter months. The store catches up missed periods before servicing task requests. Logging and points are transactional. Accumulated logs carry a minutes or count unit and their original rate. The legacy minutes quantity field stores either unit; an appended migration preserves existing minute logs. Repeated tasks and habits share this logging behavior, with separate category progress. History uses dated entries and original scoring rates, including when a duration log is corrected. Personal data never enters project or provider inputs.

The Projects Action center derives Review, In progress and the next eligible ticket from saved ticket state. Blockers remain separate from status. The board and milestone list use the same ticket controls and validation.

## AI, publication and preview

Adapters provide connection status, live model catalogs and per-provider execution. Codex runtime credentials are managed through its configured keyring. GitHub and configured API credentials use desktop OS-protected storage, separate from project records. Opening the UI can check connection metadata without a model turn. At startup, saved API keys are restored at once; the Codex and DeepSeek Harness checks start a few seconds after the window opens, one at a time.

Planning returns drafts for explicit approval. Ticket breakdowns require coverage of the original acceptance criteria before creating child tickets. A coding run records its selected provider, prompt, accepted context and source revision. Codex uses the prepared ticket worktree. Current DeepSeek and compatible API coding produces a bounded diff for selected tracked text files. A separate owner decision applies that diff after a scope check.

Issue and PR publication use explicit approval and saved operation receipts. A lost reply is reconciled against remote evidence before another write. PR evidence and local approvals depend on the head commit and ticket scope. A coding ticket becomes Done after observing its matching merge.

A preview runs the project's saved command in the ticket worktree. The app retains process identity and checks it before reusing or stopping a recovered preview. FocusFlow previews open a separate named workspace and report readiness after the interface loads.

## Making changes

Keep product data out of source and fixtures out of startup. Retain supported migrations and recovery. Run static boundaries and type checking before review. Use the [development guide](DEVELOPMENT.md) for launch and recovery commands and the PR for exact verification evidence.
