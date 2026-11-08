# FocusFlow

A Windows desktop app for daily tasks and personal projects. Built with TypeScript, React, Electron and SQLite. Single user, local data, no FocusFlow account.

**Development preview.** Personal and manual Projects are available. AI/GitHub integrations have preview implementations; live coding, AI review and trusted one-click updates remain unfinished. There is no official signed release.

![Action center with Review, In progress and one Next task](docs/images/action-center.jpg)

*Actual browser rendering of the shared desktop interface with synthetic sample data. These screenshots contain no personal tasks, account details or credentials.*

## Try it on Windows

Install Git and Node 24.12.x or a later 24.x release, then run:

~~~powershell
git clone https://github.com/gh01wzx/focusflow.git
cd focusflow
npm ci
.\Start-FocusFlow.cmd
~~~

After setup, double-click **Start-FocusFlow.cmd**. Run npm ci again when dependencies change. The source launcher builds the app, keeps its console open and uses separate **Sample data**. Personal and manual Projects need no GitHub/Codex sign-in or model allowance. A browser preview is available with npm run start:web.

For a proposed change, check out its exact PR commit and run **Review-FocusFlow.cmd** with the review name supplied in that PR. Reopen the same name to retain changes; use a new name for fresh examples. Source, named reviews and installed everyday data stay separate.

The packaging target is Windows x64. Installed automation runs on GitHub's Windows runner; other Windows configurations have not been separately certified. Build an unsigned development installer with npm run package:windows, open the versioned installer in release, then open **FocusFlow** from the Desktop or Start menu. It bundles Electron/Node, installs per user and needs no Node/npm on the destination computer. Windows may show unknown-publisher or SmartScreen prompts; verify the source and candidate before deciding whether to run one. No downloadable official release or automatic updater is provided.

## What works now

| Area | What you can do |
| --- | --- |
| Personal | Add dated tasks, complete/cancel them, browse Today, Upcoming and History |
| Repeating tasks | Repeat daily or on selected weekdays; retain missed periods without overdue accumulation |
| Manual Projects | Create Projects, Milestones and Tickets; edit text and acceptance criteria |
| Next action | Review work, see active tasks and explicitly start one eligible Backlog ticket |
| Status board | Browse Backlog, In Progress, Review and Done across milestones |
| Blockers | Link prerequisites, open the exact blocker and add/clear a manual reason |
| Data protection | Retain records after restart; verify snapshots before migration; restore separately |
| Optional previews | Connect GitHub, edit/approve saved plan drafts, publish approved coding Issues and explicitly compare linked work; live acceptance remains separate |

Task deletion, coding execution/recovery, AI PR review and official one-click updates are unavailable. Coding drafts cannot start or be marked Done through manual controls.

## Complete a small project

1. Open **Projects**, choose **New project**, then create a milestone and three **Manual** tickets.
2. Give each ticket an observable acceptance step. Use **Set prerequisites** to make the second ticket depend on the first.
3. Open **Action center** and explicitly start the first ticket. Blocked tasks cannot be recommended or started.
4. Open its details and move it through **Review** to **Done**, then explicitly start the newly eligible ticket. Finishing work never starts the next ticket automatically.
5. Choose **Status board** to compare all four columns. Reopen the same profile to retain text, identity, progress and dependency links.

**Blocked is a notice, not a fifth status.** Its links open unfinished prerequisites, including in another milestone. A manual reason stays until you clear it.

![Project board showing Backlog, In Progress, Review and Done](docs/images/status-board.jpg)

## Use Personal each day

Add a task with a planned date; the default is Today. Temporary tasks stay pending until resolved and keep their original date. Choose **Daily** or **Weekly** for repeats; Weekly lets you select weekdays.

Repeats follow the computer's local date. An unfinished recurring period becomes **Missed** in History rather than stacking up overdue copies. Completing/cancelling affects one occurrence. Stopping a repeat preserves history and any current occurrence. Older weekly schedules keep their original seven-day periods. [Detailed usage and integration instructions](docs/USAGE.md).

![Today view with dated tasks and a daily repeat](docs/images/today.jpg)

## Data and recovery

Installed everyday tasks are stored outside the source and installation folders:

~~~text
%LOCALAPPDATA%\FocusFlow\desktop\data\tracker.db
~~~

Source launches and named reviews use separate sample data. Reopening never resets a profile or adds more examples. [Exact data paths](docs/DEVELOPMENT.md#data-paths).

Existing databases change format only after a verified pre-change snapshot. A failed migration rolls back. Do not open newer data with an older app or overwrite the only current copy during recovery; restore a compatible snapshot to a separate target first. These protections do not implement installer rollback or a trusted updater. [Recovery commands](docs/DEVELOPMENT.md#backup-and-recovery).

Personal/manual task actions stay local. Optional AI generation sends the goal you explicitly submit to OpenAI and uses ChatGPT Codex allowance. Optional approved publication sends previewed coding-ticket content to the selected GitHub repository. API-key billing is refused. Automated provider tests use simulations without spending live-model allowance. Credentials and personal databases never belong in public source. [GitHub setup and limits](docs/GITHUB_CONNECTION.md) � [AI setup](docs/DEVELOPMENT.md#ai-account-setup-and-validation).

## Architecture and evidence

React components render controls, controllers coordinate state, checked clients call local HTTP routes, and feature services enforce task rules. SQL repositories persist to SQLite; workspace composition owns transactions and shutdown. [Architecture](docs/ARCHITECTURE.md) follows one Add task action through the layers.

| Scenario | Evidence and limits |
| --- | --- |
| Personal across days/restarts | [Task #37 / PR #70](https://github.com/gh01wzx/focusflow/pull/70): selected weekdays, old schedules and missed periods |
| Complete a manual project | [Task #67 / PR #92](https://github.com/gh01wzx/focusflow/pull/92): browser/installed Start, Review, Done, dependencies and exact restart records |
| Installed entry and data preservation | [Task #63 / PR #96](https://github.com/gh01wzx/focusflow/pull/96): exact tested source, shortcut targets, duplicate handoff, replacement and separate recovery; unsigned development builds |
| AI self-improvement and official update | [Task #68](https://github.com/gh01wzx/focusflow/issues/68): unfinished; no end-to-end MVP claim |

Required code checks: npm run check:language, npm run typecheck, npm run build and npm test. Public standard-runner CI also exercises browser/installed workflows. Each PR records its tested commit and failures. Passing hosted checks do not diagnose an earlier native crash on another machine. Persistent CI artifact uploads and caches are disabled. [Coverage and limitations](docs/VALIDATION.md).

For startup problems, record **Build information** when possible. Preserve data and run npm run diagnose:desktop for one data-free runtime attempt. Stop after a native failure and report the result before another controlled experiment. [Developer guidance](docs/DEVELOPMENT.md).

The [MVP task index](https://github.com/gh01wzx/focusflow/issues/28) tracks remaining work. [Product baseline](docs/PRODUCT_BASELINE.md) � [Windows release route](docs/RELEASE_ROUTE.md).
