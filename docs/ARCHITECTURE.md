# Architecture

FocusFlow is one local Windows desktop application. It currently supports dated Personal tasks and daily/weekly repeats.

## Read the code

| Responsibility | Start here |
| --- | --- |
| Desktop startup, window security and shutdown | [desktop/main.ts](../src/desktop/main.ts) |
| Page layout and task controls | [TodayApp.tsx](../public/today/TodayApp.tsx), [components](../public/today/components) |
| Page state, refresh, busy guards and feedback | [useTodayController.ts](../public/today/useTodayController.ts) |
| Browser API calls and response validation | [client/tasks.ts](../src/client/tasks.ts), [task-codec.ts](../src/shared/task-codec.ts) |
| Shared data types and calendar arithmetic | [shared/tasks.ts](../src/shared/tasks.ts), [calendar.ts](../src/shared/calendar.ts) |
| HTTP request boundary and task routes | [tasks/server.ts](../src/tasks/server.ts), [routes.ts](../src/tasks/routes.ts), [http](../src/http) |
| Task actions, recurrence and list rules | [service.ts](../src/tasks/service.ts), [recurrence.ts](../src/tasks/recurrence.ts), [view.ts](../src/tasks/view.ts) |
| SQL and checked row decoding | [repository.ts](../src/tasks/repository.ts) |
| Database opening, schema and composition | [connection.ts](../src/tasks/connection.ts), [schema.ts](../src/tasks/schema.ts), [store.ts](../src/tasks/store.ts) |
| Migration, backup and separate-path recovery | [database](../src/database) |

[app.tsx](../public/today/app.tsx) only mounts React. [src/main.ts](../src/main.ts) is an optional browser development entry using the same local service.

## Trace Add task

1. TaskComposer submits through useTodayController; the controller disables conflicting actions.
2. The task client sends JSON to the local API and checks the returned data before updating the page.
3. The HTTP boundary enforces Host, Origin, content type and a 4 KiB body limit; routes select the action.
4. The task service validates input and uses repository operations inside one writer transaction.
5. SQLite commits, the API returns refreshed lists, and the controller reports success. Failed saves preserve form input.

Electron owns the window and an OS-selected IPv4 loopback service. The renderer has no Node integration. Restrictive navigation, permissions and CSP remain in place. There is no cloud backend or Tracker login.

## Data and repeating periods

Schema remains **3**; this refactor adds no migration. Product data stays outside source/install directories. Foreign/newer databases are refused; upgrades require verified pre-change snapshots.

Each rule records its frequency, first date and next unmaterialized date. Occurrences have unique rule/date pairs and independent statuses. Daily periods span one local day; weekly periods span seven calendar days from the first date. Date-only arithmetic avoids DST-hour assumptions.

The store composes the database, repository and service. Before a read/action, one transaction expires unfinished periods, records elapsed periods, creates the current occurrence and advances the cursor. Failure rolls everything back. Clock rollback never reopens resolved periods. Stopping retains history/current work and prevents further generation.

The controller refreshes on focus/visibility and every 30 seconds while visible. A generation counter prevents older reads replacing newer changes. Missed timestamps record detection time. Device timezone changes follow the newly observed local date. Catch-up/history remain unpaginated.

## Keep the boundaries

- Components render controls; the controller coordinates state; the client handles HTTP.
- Shared contracts/calendar code have no Node, React or feature dependencies.
- Task business rules have no runtime SQL/HTTP dependency. Repository types describe the existing SQL adapter without adding a generic repository framework.
- SQL stays in the repository/schema/connection modules. Store owns composition, transactions and database closure.
- HTTP, database and Codex infrastructure stay separate. Future features should follow actual needs rather than introduce empty frameworks.

npm run typecheck also checks static import boundaries, unresolved local imports and runtime cycles. Strict checks include unused symbols, missing returns and switch fallthrough. The dependency check covers literal TypeScript imports/re-exports and module loading; it is not a security sandbox or a complete linter.

## Codex and release work

[src/codex](../src/codex) remains standalone groundwork invoked only by explicit developer commands. Today has no AI execution path.

Product GitHub authorization, coding permissions/recovery, independent review and signed updates remain future work. See [roadmap](ROADMAP.md) and [validation](VALIDATION.md).
