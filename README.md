# FocusFlow

A Windows desktop task tracker built with TypeScript, React, Electron and SQLite. Data stays on your computer; no Tracker account is required.

**Status:** Personal tasks, selected-weekday repeats and manual Projects are available. This is an unsigned development build; the complete MVP remains in progress.

## Available now

- Add temporary tasks with a planned date, defaulting to today.
- Complete or cancel tasks; keep their records in History.
- See due/overdue tasks in Today and future tasks in Upcoming.
- Keep tasks across restarts, with original planned dates.
- Repeat daily or on selected weekdays, retain missed periods in History and stop future repeats.
- Switch to Projects, create projects/milestones/manual tickets, write acceptance criteria and change ticket status.

Editing/deletion, Kanban, AI planning, coding/review and one-click updates are not implemented.

## Repeating tasks

Choose **Repeat** and a start date of today or later. Daily tasks reset at local midnight. For **Weekly**, select one or more weekdays, such as Mon, Tue and Sat. Each selected date is a separate task, starting on the first matching date on or after the start date. Unselected days have no task. Dates follow the computer's current local timezone.

Existing weekly schedules retain their original seven-day periods after upgrading. Their schedule list explicitly identifies this behavior; editing weekdays is not available.

Completing/cancelling affects one occurrence. Unfinished periods become **Missed** in History; reopening catches up closed-app periods without overdue accumulation. Temporary tasks keep their original dates and stay pending.

Expand **Repeating tasks** to stop a schedule. Its current-period task stays available; a future first occurrence is cancelled. History is retained. Upcoming shows the first scheduled task, not an infinite preview.

## Manual projects

Choose **Projects** to see three horizontal columns: Review, In Progress and one recommended Ready ticket across all projects. Each column has its own border, background and count. Smaller windows can scroll the columns horizontally. Lists use creation time, oldest first, with ticket ID breaking ties. Expand View details for descriptions and acceptance criteria. Start ticket moves only the chosen Ready ticket to In Progress; nothing starts automatically. Mark a ticket Ready only when its prerequisites are finished.

Select a project directly in the sidebar to open its milestones and tickets. Choose **New project** to create one. **Action center** stays in the sidebar to return to the overview. Each ticket can move between Backlog, Ready, In Progress, Review, Done and Blocked. Descriptions and acceptance criteria support multiple lines.

The sidebar selects a project; the milestone selector limits the visible ticket list. Manual tickets have no GitHub/Codex controls. Everything stays in the local database across restarts. Switching workspaces starts their default view; unsaved form drafts are not retained across workspace changes.

Use **Set prerequisites** on a ticket to choose work that must finish first. Links stay within the same project, including different milestones. Self-links and circular chains are rejected. Unfinished prerequisites appear by title; click one to jump to its milestone. A Ready ticket is recommended and startable only when every prerequisite is Done. Blocked tickets are never recommended, and completing a prerequisite never starts another ticket automatically.

## Run on Windows

Install Node 24.12.x or a later 24.x release. In the project folder, run:

~~~powershell
npm ci
.\Start-FocusFlow.cmd
~~~

Run npm ci again when dependencies change. After setup, double-click Start-FocusFlow.cmd. The source launcher builds the app and keeps its console open. Source runs open separate development data, marked **Sample data**. Electron downloads its pinned runtime on first use.

For an unsigned installer, open the passing **Windows desktop checks** run and download **windows-today**. Check the run result before using its artifact. The installer bundles Node/Electron; it does not provide automatic updates.

## Local data

The Windows product database is at:

~~~text
%LOCALAPPDATA%\FocusFlow\desktop\data\tracker.db
~~~

It is outside source and installation output. The app does not import the old Phase 0 notes or access the separate Codex login profile. No task data is sent to GitHub or an AI service.

## Try a proposed change

In the checkout for the PR you are reviewing, run:

~~~powershell
npm ci
.\Review-FocusFlow.cmd pr-72
~~~

Use the name given in the PR. The equivalent command is npm run review -- pr-72. The window shows **Sample data - Review pr-72** in its title and a yellow **Sample data** notice above both workspaces.

The first run creates a few example tasks and a sample project. Add, complete or change them freely. Reopen with the same name to keep your changes; a different name starts a separate workspace. Review names use letters, numbers and hyphens.

An installed build also supports review mode:

~~~powershell
& "$env:LOCALAPPDATA\Programs\FocusFlow\FocusFlow.exe" --review pr-72
~~~

Use the actual installation path if it differs. Opening the installed app normally still uses your everyday tasks. Source development, named review and installed everyday data are separate; your existing everyday data is not moved or copied. To return to it after using the source launcher, open the installed app normally.

Review/development folders are also separated by database format. A format change starts fresh sample data rather than upgrading another format's review workspace. See [Development](docs/DEVELOPMENT.md#data-paths) for paths and deliberate migration trials. Earlier builds without review mode must use their documented disposable-test setup; do not assume they understand the new review command.

## Read the project

Start with [Architecture](docs/ARCHITECTURE.md): it follows one Add task action from the screen to SQLite. Open `public/today/components/TaskComposer.tsx` alongside it; read one path before browsing every folder.

The [MVP task index](https://github.com/gh01wzx/focusflow/issues/28) is the roadmap. Feature labels group the user stories; the owner selects one task at a time.

| Document | Purpose |
| --- | --- |
| [Architecture](docs/ARCHITECTURE.md) | Components, request flow and code-reading order |
| [Development](docs/DEVELOPMENT.md) | Build, tests, data paths and recovery |
| [Product baseline](docs/PRODUCT_BASELINE.md) | Approved MVP requirements |
| [Validation](docs/VALIDATION.md) | Verification coverage, retained evidence and known limits |
| [Codex commands](docs/CODEX.md) | Optional standalone integration checks |

Source, app text and repository documentation use English. User-entered content keeps its original language.
