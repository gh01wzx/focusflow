# FocusFlow

A Windows desktop app for daily tasks and personal projects. Built with TypeScript, React, Electron and SQLite. Single user, local data, no FocusFlow account.

**Development preview.** Personal, manual Projects and the AI planning/coding/review workflow have source implementations. The new AI workflow needs owner-led Windows acceptance; compiled code is not live integration evidence. Installation, releases and one-click updates are deferred.

**Local acceptance workflow:** double-click Start-FocusFlow.cmd. It prepares missing source dependencies and the pinned AI runtime, builds the source and opens the app. It does not run tests, sign in or request a model response. This implementation batch is unverified until the owner performs local acceptance. Automated verification workflows are manual-only. Installation, release and updates are deferred.

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

For a proposed change, check out its exact PR commit and run **Start-FocusFlow.cmd --review** with the review name supplied in that PR. Reopen the same name to retain changes; use a new name for fresh examples. Source, named reviews and installed everyday data stay separate.

Use the source launcher for current acceptance. Existing packaging and recovery tools are retained for later work; no installation or release is part of this delivery.

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
| AI planning | Generate, edit, select and explicitly approve local task drafts |
| GitHub | Connect through an App or a fine-grained token; preview coding Issues before publishing; compare linked requirements |
| Coding | Prepare a separate Git worktree, explicitly start one task, answer permission requests, stop and recover retained work |
| PR delivery | Preview the exact changed files and create/update the same linked PR; reconcile uncertain writes |
| Review | Read actual diff/check evidence, request a separate AI assessment, ask code questions and explicitly resume with feedback |
| Completion | Open the PR on GitHub to merge; refresh its actual merged state to mark the coding ticket Done |

Task deletion and official one-click updates are outside this delivery. Unpublished coding drafts cannot start. Coding progress uses its dedicated controls; Done requires an observed linked PR merge. All new coding/review behavior is untested pending local acceptance.

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

Personal/manual actions stay local. Optional AI uses ChatGPT Codex allowance: planning sends the entered goal, coding operates on the selected ticket worktree, and review sends bounded PR code/diff/check evidence and the question. Each model request requires explicit consent; API-key billing is refused. Approved publication sends previewed ticket or source content to the selected GitHub repository. Credentials and personal databases never belong in public source. [GitHub setup and limits](docs/GITHUB_CONNECTION.md) | [AI setup](docs/DEVELOPMENT.md#ai-account-setup-and-validation) | [Coding and review](docs/USAGE.md#code-and-review-one-ticket).

## Architecture and evidence

React components render controls, controllers coordinate state, checked clients call local HTTP routes, and feature services enforce task rules. SQL repositories persist to SQLite; workspace composition owns transactions and shutdown. [Architecture](docs/ARCHITECTURE.md) follows one Add task action through the layers.

| Scenario | Evidence and limits |
| --- | --- |
| Personal across days/restarts | [Task #37 / PR #70](https://github.com/gh01wzx/focusflow/pull/70): selected weekdays, old schedules and missed periods |
| Complete a manual project | [Task #67 / PR #92](https://github.com/gh01wzx/focusflow/pull/92): browser/installed Start, Review, Done, dependencies and exact restart records |
| Installed entry and data preservation | [Task #63 / PR #96](https://github.com/gh01wzx/focusflow/pull/96): exact tested source, shortcut targets, duplicate handoff, replacement and separate recovery; unsigned development builds |
| AI self-improvement and official update | [Task #68](https://github.com/gh01wzx/focusflow/issues/68): unfinished; no end-to-end MVP claim |

The owner requested code implementation followed by unified local acceptance. This batch runs no test suite, native app, model or installer. Static compiler/language results, where executed, are recorded against the PR commit. Workflows are manual-only; historical checks below do not verify new features. Persistent CI artifact uploads and caches stay disabled. [Coverage and limitations](docs/VALIDATION.md).

For startup problems, record **Build information** when possible. Preserve data and run npm run diagnose:desktop for one data-free runtime attempt. Stop after a native failure and report the result before another controlled experiment. [Developer guidance](docs/DEVELOPMENT.md).

The [MVP task index](https://github.com/gh01wzx/focusflow/issues/28) tracks remaining work. [Product baseline](docs/PRODUCT_BASELINE.md) | [Windows release route](docs/RELEASE_ROUTE.md).
