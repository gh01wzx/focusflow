# Architecture

FocusFlow is one local Windows desktop application. It supports dated Personal tasks, daily/weekly repeats and a manual Project / Milestone / Ticket hierarchy.

## Read the code

| Responsibility | Start here |
| --- | --- |
| Desktop startup, window security and shutdown | [desktop/main.ts](../src/desktop/main.ts) |
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

1. TaskComposer submits through useTodayController; the controller disables conflicting actions.
2. The task client sends JSON to the local API and checks the returned data before updating the page.
3. The HTTP boundary enforces Host, Origin, content type and a bounded body limit; routes select the action.
4. The task service validates input and uses repository operations inside one writer transaction.
5. SQLite commits, the API returns refreshed lists, and the controller reports success. Failed saves preserve form input.

Electron owns the window and an OS-selected IPv4 loopback service. The renderer has no Node integration. Restrictive navigation, permissions and CSP remain in place. There is no cloud backend or Tracker login.

## Data and repeating periods

Schema **5** adds optional weekday masks to repeating rules; null retains existing schedules. Migrations 1-4 retain their SQL behavior. Product data stays outside source/install directories. Foreign/newer databases are refused; upgrades require verified pre-change snapshots.

Each rule records its frequency, start date and next unmaterialized date. New weekly rules also record selected weekdays; SQL mask conversion stays in the repository, while shared calendar helpers and domain rules use weekday arrays. Occurrences have unique rule/date pairs and independent statuses. Daily and selected-weekday occurrences span one local day. Existing weekly rules without weekday selections retain their seven-day periods. Date-only arithmetic avoids DST-hour assumptions.

The workspace store owns one database connection and composes separate Personal and Projects services. Before a read/action, one transaction expires unfinished periods, records elapsed periods, creates the current occurrence and advances the cursor. Failure rolls everything back. Clock rollback never reopens resolved periods. Stopping retains history/current work and prevents further generation.

The controller refreshes on focus/visibility and every 30 seconds while visible. A generation counter prevents older reads replacing newer changes. Missed timestamps record detection time. Device timezone changes follow the newly observed local date. Catch-up/history remain unpaginated.

## Manual Projects

Projects and milestones have titles/descriptions. Tickets add acceptance criteria, six manual statuses and creation/update timestamps. SQL foreign keys bind each Ticket to a milestone and each milestone to a project. Status writes are idempotent when unchanged.

GET /api/projects optionally accepts projectId; it returns the project list and only the selected project's milestones/tickets. POST /api/projects, /api/milestones and /api/project-tickets create each level. POST /api/project-tickets/:id/status changes a manual status.

The controller displays only the selected milestone's tickets. Write requests allow up to 32 KiB for multiline text; Personal keeps its 4 KiB limit. Runtime codecs check records, parent associations and manual execution mode. No GitHub/Codex controls or calls exist in this workflow.

Action center, dependencies, editing/deletion, Kanban and AI remain later Tickets.

## Keep the boundaries

- Components render controls; the controller coordinates state; the client handles HTTP.
- Shared contracts/calendar code have no Node, React or feature dependencies.
- Personal and Projects business rules have no runtime SQL/HTTP dependency. Repository types describe the existing SQL adapter without adding a generic repository framework.
- SQL stays in feature repositories and the shared database schema/connection. Workspace store owns composition, transactions and database closure.
- HTTP, database and Codex infrastructure stay separate. Future features should follow actual needs rather than introduce empty frameworks.

npm run typecheck also checks static import boundaries, unresolved local imports and runtime cycles. Strict checks include unused symbols, missing returns and switch fallthrough. The dependency check covers literal TypeScript imports/re-exports and module loading; it is not a security sandbox or a complete linter.

## Codex and release work

[src/codex](../src/codex) remains standalone groundwork invoked only by explicit developer commands. Today has no AI execution path.

Product GitHub authorization, coding permissions/recovery, independent review and signed updates remain future work. See [roadmap](ROADMAP.md) and [validation](VALIDATION.md).
