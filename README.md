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

Deletion, coding execution/review and one-click updates are not implemented.

## Repeating tasks

Choose **Repeat** and a start date of today or later. Daily tasks reset at local midnight. For **Weekly**, select one or more weekdays, such as Mon, Tue and Sat. Each selected date is a separate task, starting on the first matching date on or after the start date. Unselected days have no task. Dates follow the computer's current local timezone.

Existing weekly schedules retain their original seven-day periods after upgrading. Their schedule list explicitly identifies this behavior; editing weekdays is not available.

Completing/cancelling affects one occurrence. Unfinished periods become **Missed** in History; reopening catches up closed-app periods without overdue accumulation. Temporary tasks keep their original dates and stay pending.

Expand **Repeating tasks** to stop a schedule. Its current-period task stays available; a future first occurrence is cancelled. History is retained. Upcoming shows the first scheduled task, not an infinite preview.

## Manual projects

Choose **Projects** to see three horizontal columns: Review, In Progress and one recommended unblocked Backlog ticket across all projects. Each column has its own border, background and count. Smaller windows can scroll the columns horizontally. Lists use creation time, oldest first, with ticket ID breaking ties. Expand View details for descriptions and acceptance criteria. Start ticket moves only the chosen Backlog ticket to In Progress; nothing starts automatically. A Backlog ticket can start only when its prerequisites are Done and no manual blocker remains.

Select a project directly in the sidebar to open its milestones and tickets. **New project** is in the sidebar only. Compact **New milestone** and **New ticket** buttons open separate creation dialogs, keeping the main page focused on existing work. **Action center** stays in the sidebar to return to the overview. Open a ticket card for its description and acceptance criteria. Use its status buttons to move between Backlog, In Progress, Review and Done. Descriptions and acceptance criteria support multiple lines.

The sidebar selects a project; the milestone selector limits the visible ticket list. Manual tickets have no GitHub/Codex controls. Everything stays in the local database across restarts. Switching workspaces starts their default view; unsaved form drafts are not retained across workspace changes. Choose Status board to browse tickets from all milestones in four horizontal status columns. Normal windows show all four columns together; narrower windows show Previous columns / Next columns controls above the cards. Each card shows its milestone and opens the same details/status controls. Milestones returns to the focused list; Action center stays the default.

Use **Edit project**, **Edit milestone** or **Edit ticket** inside a ticket's details dialog to correct its title and details. Tickets also allow editing acceptance criteria. **Save changes** keeps the same identity, parent and status, including Done; **Cancel** discards the draft without saving. A failed save keeps your input. Save or cancel an edit before switching projects, milestones or workspaces.

Use **Set prerequisites** in a ticket's details to choose work that must finish first. Click task cards to select or remove them; Selected cards show the saved choices when you reopen the picker. Links stay within the same project, including different milestones. Self-links and circular chains are rejected. Unfinished prerequisites appear by title; click one to open its details. A Backlog ticket is recommended and startable only when every prerequisite is Done and no manual blocker remains. Blocked is a notice, not a status or column. The card lists unfinished prerequisite titles and milestone names as clickable links. Links open the exact ticket, including across milestones; the action center uses the same links. Completing prerequisites removes that notice without changing status or starting work.

Use **Add blocker** inside a ticket for waiting on something outside the project. Save a reason, edit it later or choose **Clear blocker** explicitly. Manual blockers stay visible until cleared, even after prerequisites finish. A failed save keeps your input; Cancel discards it. Blockers can appear on Backlog, In Progress and Review cards. Done cards keep their saved reason and dependency records without displaying an active blocked notice.

Choose **Work type** when creating or editing an unpublished Backlog ticket. **Manual** keeps the usual status controls. **Coding with Codex** saves a local unpublished coding draft and shows its project repository, if connected. It creates no Issue or coding run. Coding drafts are excluded from next-task recommendations and cannot start or be marked Done. Published coding records show their GitHub Issue number as the task ID and retain their repository identity; work type cannot change after publication or while running. Publication and coding execution are later features.

Existing installed data upgrades only after a verified pre-change backup. Old Ready tickets become Backlog; old Blocked tickets become Backlog with a manual blocker that you must explain or clear. IDs, text and dependency links remain. Named reviews use separate format-11 sample data; previous review formats remain untouched.

## AI connection preview

Open **AI connection** in the sidebar to check the separate FocusFlow Codex account. Install the pinned official runtime explicitly with npm run ai:install from a source checkout, then choose **Sign in with ChatGPT** and follow the browser link. The shared runtime stays under %LOCALAPPDATA%\FocusFlow\codex-product\runtime. Each app profile supplies its own codex-profile directory for sign-in settings. Live Windows credential-store separation still needs verification. Credentials use the OS credential store; no plaintext fallback is configured and existing Codex App sessions are not copied.

**Check account** does not request a model response. **Run read-only AI check** requires the allowance checkbox and a ChatGPT-authenticated account. It consumes Codex allowance; API-key and other auth modes are refused. Code-writing remains later work. The new product login/keyring/live path still needs an owner-triggered Windows trial; ordinary tests use simulated accounts/results and never call a live model.

## AI plan drafts

Open a project and choose **AI plan draft**. Enter a goal, confirm that generation uses Codex allowance, then choose **Generate draft**. Only the entered goal is included in the planning prompt. It is sent to OpenAI through the pinned Codex runtime; project files, existing tasks and GitHub credentials are not attached. Each request checks for a ChatGPT account again. API-key billing is refused.

Progress and **Cancel generation** remain visible while waiting. Closing the dialog requests cancellation too. A request already sent may use allowance. There is no automatic retry after failure, cancellation or reopening. Provider-internal retry progress may appear during an existing request.

A valid result is saved only in this data profile, separately from project milestones and tickets. Reopen the dialog to read it without another model call. Expand suggestions to see descriptions, acceptance criteria, proposed Manual/Coding modes and prerequisite titles. Failed or cancelled replacements keep the previous draft and all existing tasks. Generating creates no approved tasks, GitHub Issues, pull requests or coding runs. Live response quality and Windows credential-store behavior still require an owner-triggered trial; automated checks use simulated replies.

Choose **Edit draft plan** to correct milestone/task text, acceptance criteria, work types and prerequisite links. Clear **Include task** to exclude an unwanted suggestion. Save draft changes keeps those choices across restarts without creating project tickets. Cancel discards unsaved changes; failed saves retain your input. Save or cancel before closing the editor. A draft changed elsewhere must be reopened before saving or approving.

Choose **Preview selected plan** to inspect exactly which milestones and tasks will be created. Excluded prerequisites must be included or their links removed explicitly. Confirm the checkbox and choose **Approve selected plan**. The selected plan is saved together in Backlog with its dependencies. Nothing starts or publishes to GitHub. Coding tasks remain unpublished and unstartable. Repeated approval, a lost reply or restarting cannot duplicate that plan. A failed write saves none of the plan; reopen to check its approval result before retrying. Approved drafts cannot be edited again; edit their saved tickets or generate a new draft instead.

## Publish approved coding work

Open **Publish approved work** in a project, then **Preview publication**. The Windows GitHub connection must already have an owner-authorized App installation with Issues read/write access. This feature cannot grant that permission. Inspect the repository name, visibility and public Issue content, confirm the checkbox, then approve the whole batch. Only coding tasks from approved plans are published. Personal data, goals, project notes and manual task text are excluded. One publication approval covers the batch; no per-task approval or automatic coding Start follows.

GitHub assigns each Issue number after creation; the final title uses [ID] and coding prerequisite references use assigned numbers. The preview explains these substitutions and shows the public recovery marker. Results are saved per task. Reopen after restart or **Resume approved publication** to recover missing links, without duplicating successful creations. A definite refusal retains uncreated work for an explicit retry. An uncertain creation is searched by its marker; absence does not permit another creation. Conflicting/duplicate markers or remote edits require reconciliation. A wholly unstarted batch can be cancelled before revising its preview. Approved publication content and repository are locked; requirement reconciliation is a later feature. No product live-write trial is claimed by simulated tests.

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

It is outside source and installation output. The app does not import the old Phase 0 notes or access the separate Codex login profile. Local task data is not sent automatically. An explicitly requested AI draft sends the entered goal to OpenAI; saved drafts stay in local data and backups.

## Try a proposed change

In the checkout for the PR you are reviewing, run:

~~~powershell
npm ci
.\Review-FocusFlow.cmd pr-72
~~~

Use the name given in the PR. The equivalent command is npm run review -- pr-72. The window shows **Sample data - Review pr-72** in its title and a yellow **Sample data** notice above both workspaces.

The first run creates a few Personal examples and **Sample project** with three milestones and 12 manual tickets covering all four statuses. Open the project and choose **Status board** to see them together. Examples include a Backlog ticket waiting for a prerequisite in another milestone, a manual blocker and an active ticket with a completed prerequisite. Descriptions explain what to try; each ticket includes acceptance steps.

Fresh sample profiles also include a saved example under **AI plan draft**. Edit, exclude, preview and approve it without installing Codex, signing in or calling a model. Its three suggestions are separate from the 12 existing sample tickets until you approve them. Existing sample data is never topped up or reset.

Add, complete or change examples freely. Reopen with the same name to keep your changes; a different name starts a separate workspace. Review names use letters, numbers and hyphens. Existing review databases are never topped up or reset. To get newly added examples, use a new review name, such as task-41-four-states.

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
