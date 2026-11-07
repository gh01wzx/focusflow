# Architecture

FocusFlow is one local Windows desktop application. It supports dated Personal tasks, daily/weekly repeats and a manual Project / Milestone / Ticket hierarchy.

## Start with one feature

Read [README](../README.md) for what the app does, then follow Add task below. The [MVP task index](https://github.com/gh01wzx/focusflow/issues/28) describes planned work; it is not a list of implemented features.

| Location | Purpose | Example |
| --- | --- | --- |
| public | React screens, form controls and styles | The title field and Add task button |
| src | Local application logic, HTTP, database access and desktop startup | Validate and save a task |
| scripts | Commands used to build, verify, package or recover the app | Bundle React; exercise an installed app |
| test | Automated scenarios using disposable data | Check that tasks survive a restart |
| docs | Product scope, architecture, development and evidence | This reading guide |
| .github/workflows | Checks run by GitHub when code is pushed or a PR changes | Windows/Linux tests and installed-app checks |
| package.json | Dependencies and named development commands | npm run build and npm test |

Files ending in .tsx contain React interface code; .ts files contain TypeScript logic; .css controls appearance. The ignored dist directory contains generated runnable output. Edit the source files listed here.

## Find a responsibility

| Responsibility | Start here |
| --- | --- |
| Desktop startup, window security and shutdown | [desktop/main.ts](../src/desktop/main.ts) |
| Source, review and installed data selection | [runtime/profile.ts](../src/runtime/profile.ts) |
| Workspace switch and feature pages | [WorkspaceApp.tsx](../public/workspace/WorkspaceApp.tsx), [TodayApp.tsx](../public/today/TodayApp.tsx), [ProjectsApp.tsx](../public/projects/ProjectsApp.tsx) |
| Page state, refresh, busy guards and feedback | [Personal controller](../public/today/useTodayController.ts), [Projects controller](../public/projects/useProjectsController.ts) |
| Typed browser calls and checked responses | [client](../src/client), [shared contracts/codecs](../src/shared) |
| Shared data types and calendar arithmetic | [shared/tasks.ts](../src/shared/tasks.ts), [calendar.ts](../src/shared/calendar.ts) |
| HTTP boundary and feature routes | [workspace/server.ts](../src/workspace/server.ts), [task routes](../src/tasks/routes.ts), [project routes](../src/projects/routes.ts) |
| Task actions, recurrence and list rules | [service.ts](../src/tasks/service.ts), [recurrence.ts](../src/tasks/recurrence.ts), [view.ts](../src/tasks/view.ts) |
| SQL and checked row decoding | [repository.ts](../src/tasks/repository.ts) |
| Manual project rules and SQL | [project service](../src/projects/service.ts), [project repository](../src/projects/repository.ts) |
| Shared database and composition | [connection.ts](../src/database/connection.ts), [schema.ts](../src/database/schema.ts), [workspace/store.ts](../src/workspace/store.ts) |
| Migration, backup and separate-path recovery | [database](../src/database) |

[app.tsx](../public/today/app.tsx) only mounts React. [src/main.ts](../src/main.ts) is an optional browser development entry using the same local service.

## Trace Add task

Use a task with Repeat set to Does not repeat for the first read. Follow these files in order; there is no need to understand every helper first.

| Step | File | What to look for |
| --- | --- | --- |
| 1. Submit the form | [TaskComposer.tsx](../public/today/components/TaskComposer.tsx) | onSubmit calls state.add; fields call their state setters |
| 2. Coordinate saving | [useTodayController.ts](../public/today/useTodayController.ts) | add passes the draft to client.add through change; change manages busy/error state |
| 3. Send the request | [client/tasks.ts](../src/client/tasks.ts) | add selects POST /api/tasks; request sends JSON and checks the response |
| 4. Receive and route it | [workspace/server.ts](../src/workspace/server.ts), [tasks/routes.ts](../src/tasks/routes.ts) | The server checks the request; matchTaskRoute selects add and dispatchTaskRoute calls store.add |
| 5. Apply the rules | [tasks/service.ts](../src/tasks/service.ts), [validation.ts](../src/tasks/validation.ts) | add validates the title/date, assigns an ID and requests insertTask inside a transaction |
| 6. Write the row | [tasks/repository.ts](../src/tasks/repository.ts) | insertTask executes the parameterized SQL INSERT |
| 7. Display the result | [useTodayController.ts](../public/today/useTodayController.ts), [TodayApp.tsx](../public/today/TodayApp.tsx) | The response contains refreshed lists; apply updates React state and the page renders it |

[workspace/store.ts](../src/workspace/store.ts) supplies the shared database and transaction to the services. Failed saves preserve form input. For a repeating task, the client selects /api/recurrences instead; then read service.addRecurrence, [weekdays.ts](../src/shared/weekdays.ts) and [recurrence.ts](../src/tasks/recurrence.ts).

After this path, read [tasks.test.ts](../test/tasks.test.ts) for temporary-task examples and [weekdays.test.ts](../test/weekdays.test.ts) for selected weekdays and old-schedule migration. Projects follows the same component/controller/client/routes/service/repository split.

Electron owns the window and an OS-selected IPv4 loopback service. The renderer has no Node integration. Restrictive navigation, permissions and CSP remain in place. There is no cloud backend or Tracker login.

## Data and repeating periods

Schema **5** adds optional weekday masks to repeating rules; null retains existing schedules. Migrations 1-4 retain their SQL behavior. Product data stays outside source/install directories. Foreign/newer databases are refused; upgrades require verified pre-change snapshots.

Each rule records its frequency, start date and next unmaterialized date. New weekly rules also record selected weekdays; SQL mask conversion stays in the repository, while shared calendar helpers and domain rules use weekday arrays. Occurrences have unique rule/date pairs and independent statuses. Daily and selected-weekday occurrences span one local day. Existing weekly rules without weekday selections retain their seven-day periods. Date-only arithmetic avoids DST-hour assumptions.

The workspace store owns one database connection and composes separate Personal and Projects services. Before a read/action, one transaction expires unfinished periods, records elapsed periods, creates the current occurrence and advances the cursor. Failure rolls everything back. Clock rollback never reopens resolved periods. Stopping retains history/current work and prevents further generation.

The desktop/browser entry selects its data directory before opening a store. Installed default data retains the product location; source defaults and named reviews use separate schema-specific sample directories. The store calls [sample-data.ts](../src/workspace/sample-data.ts) only for a new sample database. Examples use existing task/project services inside one transaction. The local server adds an escaped notice/title to the HTML for sample workspaces, outside React so it remains visible in both workspaces. Path selection does not depend on renderer input. See [data paths](DEVELOPMENT.md#data-paths).

The controller refreshes on focus/visibility and every 30 seconds while visible. A generation counter prevents older reads replacing newer changes. Missed timestamps record detection time. Device timezone changes follow the newly observed local date. Catch-up/history remain unpaginated.

## Manual Projects

Projects and milestones have titles/descriptions. Tickets add acceptance criteria, six manual statuses and creation/update timestamps. SQL foreign keys bind each Ticket to a milestone and each milestone to a project. Status writes are idempotent when unchanged.

GET /api/projects optionally accepts projectId; it returns the project list and only the selected project's milestones/tickets. POST /api/projects, /api/milestones and /api/project-tickets create each level. POST /api/project-tickets/:id/status changes a manual status.

POST /api/projects/:id/details, /api/milestones/:id/details and /api/project-tickets/:id/details edit text through the same checked client, service transaction and SQL repository. Text validation is shared with creation. Updates preserve IDs, parent links, creation times and statuses; ticket text changes advance updatedAt only when the text changes. No schema change is needed.

The controller allows one details editor at a time. It blocks view navigation during editing, retains the editor after failed saves and ignores older refresh responses after a save. DetailsEditor owns its draft, so a background read cannot replace entered text. Cancel only closes the editor.

The controller displays only the selected milestone's tickets. Write requests allow up to 32 KiB for multiline text; Personal keeps its 4 KiB limit. Runtime codecs check records, parent associations and manual execution mode. No GitHub/Codex controls or calls exist in this workflow.

Dependencies, deletion, Kanban and AI remain later Tickets.

## Keep the boundaries

- Components render controls; the controller coordinates state; the client handles HTTP.
- Shared contracts/calendar code have no Node, React or feature dependencies.
- Personal and Projects business rules have no runtime SQL/HTTP dependency. Repository types describe the existing SQL adapter without adding a generic repository framework.
- SQL stays in feature repositories and the shared database schema/connection. Workspace store owns composition, transactions and database closure.
- HTTP, database and Codex infrastructure stay separate. Future features should follow actual needs rather than introduce empty frameworks.

npm run typecheck also checks static import boundaries, unresolved local imports and runtime cycles. Strict checks include unused symbols, missing returns and switch fallthrough. The dependency check covers literal TypeScript imports/re-exports and module loading; it is not a security sandbox or a complete linter.

## Codex and release work

[src/codex](../src/codex) remains standalone groundwork invoked only by explicit developer commands. Today has no AI execution path.

Product GitHub authorization, coding permissions/recovery, independent review and signed updates remain future work. See the [MVP task index](https://github.com/gh01wzx/focusflow/issues/28) and [validation](VALIDATION.md).

## Project action center

Projects opens ActionCenter with useActionsController. GET /api/project-actions reads all project views in one transaction; shared/actions.ts selects Review, In Progress and at most one Ready task by creation time then ID. The client checks every project view before use. POST /api/project-tickets/:id/start checks Ready status inside its write transaction. Refresh responses cannot overwrite later mutations. Shared ProjectNavigation links the action center and individual projects directly; the hierarchy controller loads the selected project on entry. No dependency model or AI ranking is implied.

Ticket cards open a native ProjectDialog for details, status buttons and ticket editing. EntityComposer and TicketComposer render forms only inside creation dialogs; the project sidebar owns New project. Compact milestone/ticket buttons keep the main page focused on existing work. Dialogs use native focus containment and restore focus on close; busy saves and unfinished ticket edits prevent dismissal. ProjectHierarchy owns which dialog is open; the project controller owns saved feedback and navigation actions. ProjectDialog handles native focus containment, focus restoration and dismissal.

## GitHub connection

`shared/github.ts` validates display data; `client/github.ts` handles checked local requests; `github/service.ts` owns the device grant and read-only provider calls; `github/vault.ts` stores encrypted profile credentials. Electron injects async safeStorage. Tokens never enter project SQL or renderer responses. Project links remain separate from manual task state.
