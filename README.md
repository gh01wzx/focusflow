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

Deletion, Kanban, AI planning, coding/review and one-click updates are not implemented.

## Repeating tasks

Choose **Repeat** and a start date of today or later. Daily tasks reset at local midnight. For **Weekly**, select one or more weekdays, such as Mon, Tue and Sat. Each selected date is a separate task, starting on the first matching date on or after the start date. Unselected days have no task. Dates follow the computer's current local timezone.

Existing weekly schedules retain their original seven-day periods after upgrading. Their schedule list explicitly identifies this behavior; editing weekdays is not available.

Completing/cancelling affects one occurrence. Unfinished periods become **Missed** in History; reopening catches up closed-app periods without overdue accumulation. Temporary tasks keep their original dates and stay pending.

Expand **Repeating tasks** to stop a schedule. Its current-period task stays available; a future first occurrence is cancelled. History is retained. Upcoming shows the first scheduled task, not an infinite preview.

## Manual projects

Choose **Projects** to see three horizontal columns: Review, In Progress and one recommended Ready ticket across all projects. Each column has its own border, background and count. Smaller windows can scroll the columns horizontally. Lists use creation time, oldest first, with ticket ID breaking ties. Expand View details for descriptions and acceptance criteria. Start ticket moves only the chosen Ready ticket to In Progress; nothing starts automatically. Mark a ticket Ready only when its prerequisites are finished.

Select a project directly in the sidebar to open its milestones and tickets. **New project** is in the sidebar only. Compact **New milestone** and **New ticket** buttons open separate creation dialogs, keeping the main page focused on existing work. **Action center** stays in the sidebar to return to the overview. Open a ticket card for its description and acceptance criteria. Use its status buttons to move between Backlog, Ready, In Progress, Review, Done and Blocked. Descriptions and acceptance criteria support multiple lines.

The sidebar selects a project; the milestone selector limits the visible ticket list. Manual tickets have no GitHub/Codex controls. Everything stays in the local database across restarts. Switching workspaces starts their default view; unsaved form drafts are not retained across workspace changes.

Use **Edit project**, **Edit milestone** or **Edit ticket** inside a ticket's details dialog to correct its title and details. Tickets also allow editing acceptance criteria. **Save changes** keeps the same identity, parent and status, including Done; **Cancel** discards the draft without saving. A failed save keeps your input. Save or cancel an edit before switching projects, milestones or workspaces.

Use **Set prerequisites** in a ticket's details to choose work that must finish first. Click task cards to select or remove them; Selected cards show the saved choices when you reopen the picker. Links stay within the same project, including different milestones. Self-links and circular chains are rejected. Unfinished prerequisites appear by title; click one to open its details. A Ready ticket is recommended and startable only when every prerequisite is Done. Blocked tickets are never recommended, and completing a prerequisite never starts another ticket automatically.

## AI connection preview

Open **AI connection** in the sidebar to check the separate FocusFlow Codex account. Install the pinned official runtime explicitly with npm run ai:install from a source checkout, then choose **Sign in with ChatGPT** and follow the browser link. The shared runtime stays under %LOCALAPPDATA%\FocusFlow\codex-product\runtime. Each app profile supplies its own codex-profile directory for sign-in settings. Live Windows credential-store separation still needs verification. Credentials use the OS credential store; no plaintext fallback is configured and existing Codex App sessions are not copied.

**Check account** does not request a model response. **Run read-only AI check** requires the allowance checkbox and a ChatGPT-authenticated account. It consumes Codex allowance; API-key and other auth modes are refused. Planning and code-writing remain later work. The new product login/keyring/live path still needs an owner-triggered Windows trial; ordinary tests use simulated accounts/results and never call a live model.

## Run on Windows

Install Node 24.12.x or a later 24.x release. In the project folder, run:

~~~powershell
npm ci
.\Start-FocusFlow.cmd
~~~

Run npm ci again when dependencies change. After setup, double-click Start-FocusFlow.cmd. The source launcher builds the app and keeps its console open. Source runs open separate development data, marked **Sample data**. Electron downloads its pinned runtime on first use.

To build an unsigned installer locally, run npm run package:windows. The output is in release. CI checks packaging but does not retain downloadable installers, screenshots or caches. The installer bundles Node/Electron; it does not provide automatic updates.

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

GitHub project connection is under development; see [setup and limits](docs/GITHUB_CONNECTION.md). Manual projects work without a GitHub account.

Formal installer/update decisions and remaining trust gates are described in [Windows release route](docs/RELEASE_ROUTE.md). Current installers are unsigned development builds.
