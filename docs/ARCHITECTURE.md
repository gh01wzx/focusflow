# Architecture

FocusFlow is one local desktop application. It currently implements dated Personal tasks.

## Runtime

~~~mermaid
flowchart TD
  E["Electron desktop shell"] --> U["React Today UI"]
  E --> H["Loopback HTTP service"]
  U --> H
  H --> S["Task rules and SQLite store"]
  S --> D["Migration and backup helpers"]
~~~

Electron starts the service on an OS-selected IPv4 loopback port and loads it in a sandboxed window. React calls that local API. The store validates task data and writes SQLite. There is no cloud backend or Tracker login.

## Read the code in this order

| File | Responsibility |
| --- | --- |
| [desktop/main.ts](../src/desktop/main.ts) | Start/quit the app, select its profile, own the window and restrict navigation/permissions |
| [today/app.tsx](../public/today/app.tsx) | Render forms/lists, submit actions and refresh state |
| [tasks/server.ts](../src/tasks/server.ts) | Serve assets/API; enforce Host, Origin, JSON and body-size checks |
| [tasks/model.ts](../src/tasks/model.ts) | Shared data types, title/date validation and local calendar helpers |
| [tasks/store.ts](../src/tasks/store.ts) | Queries, state transitions and product database identity |
| [database/migrate.ts](../src/database/migrate.ts) | Sequential migrations, pre-upgrade snapshot and rollback |
| [database/backup.ts](../src/database/backup.ts) | Consistent backup, integrity/checksum checks and separate-path restoration |

[src/main.ts](../src/main.ts) is an optional browser development entry using the same task service. It is not another backend.

## Trace “Add task”

1. React submits title/date to POST /api/tasks and disables conflicting controls.
2. The service checks the request boundary and passes its JSON to the store.
3. The store validates input, creates an ID and commits the row.
4. The response returns the refreshed Today/Upcoming/History lists.
5. React reports success. A failed request preserves form input.

GET /api/tasks reads the lists. POST /api/tasks/:id/resolve completes/cancels a task. POST /api/tasks/backup creates a verified snapshot.

Today uses the computer's local calendar day. Planned dates are date-only strings; creation/resolution times are UTC instants. The renderer refreshes on focus/visibility and every 30 seconds while visible. A generation counter prevents stale reads replacing newer mutation results.

## Boundaries worth reviewing

- Renderer: no Node integration, preload credential bridge, CDN or remote fonts. Task titles render as text.
- Service: loopback only, strict Host/Origin on writes, 4 KiB request limit and restrictive CSP.
- Storage: product identity/schema checks; unrelated/newer databases are refused. Data lives outside source/install paths.
- Resolution: repeated same-state actions are idempotent; a conflicting terminal state is rejected.
- Migrations: failure rolls back; restoration creates a new database and does not overwrite the original.

## Codex is separate

[src/codex](../src/codex) contains the tested JSONL client, one-turn probes and owned-process cleanup. Only explicit developer commands invoke it. Today has no AI execution path.

Product GitHub authorization, coding permissions/recovery and review integration remain future work. See [the roadmap](ROADMAP.md).
