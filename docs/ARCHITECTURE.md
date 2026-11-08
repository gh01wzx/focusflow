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

Schema **12** appends linked Issue/PR evidence and comparison baselines. Schema 11 added publication batches and per-ticket results. Schema 10 added durable plan approval receipts and approved snapshots. Schema 9 appended coding intent/publication identity beside existing tickets. Schema 8 added four statuses and independent blocker reasons, 7 added private AI drafts and 6 added prerequisite links. Schema 5 added optional weekday masks to repeating rules; null retains existing schedules. Applied migrations retain their SQL behavior. Product data stays outside source/install directories. Foreign/newer databases are refused; upgrades require verified pre-change snapshots.

Each rule records its frequency, start date and next unmaterialized date. New weekly rules also record selected weekdays; SQL mask conversion stays in the repository, while shared calendar helpers and domain rules use weekday arrays. Occurrences have unique rule/date pairs and independent statuses. Daily and selected-weekday occurrences span one local day. Existing weekly rules without weekday selections retain their seven-day periods. Date-only arithmetic avoids DST-hour assumptions.

The workspace store owns one database connection and composes separate Personal and Projects services. Before a read/action, one transaction expires unfinished periods, records elapsed periods, creates the current occurrence and advances the cursor. Failure rolls everything back. Clock rollback never reopens resolved periods. Stopping retains history/current work and prevents further generation.

The desktop/browser entry selects its data directory before opening a store. Installed default data retains the product location; source defaults and named reviews use separate schema-specific sample directories. The store calls [sample-data.ts](../src/workspace/sample-data.ts) only for a new sample database. Examples use existing task/project services inside one transaction. The local server adds an escaped notice/title to the HTML for sample workspaces, outside React so it remains visible in both workspaces. Path selection does not depend on renderer input. See [data paths](DEVELOPMENT.md#data-paths).

The controller refreshes on focus/visibility and every 30 seconds while visible. A generation counter prevents older reads replacing newer changes. Missed timestamps record detection time. Device timezone changes follow the newly observed local date. Catch-up/history remain unpaginated.

## Manual Projects

Projects and milestones have titles/descriptions. Tickets add acceptance criteria, four manual statuses and creation/update timestamps. SQL foreign keys bind each Ticket to a milestone and each milestone to a project. Status writes are idempotent when unchanged.

GET /api/projects optionally accepts projectId; it returns the project list and only the selected project's milestones/tickets. POST /api/projects, /api/milestones and /api/project-tickets create each level. POST /api/project-tickets/:id/status changes a manual status.

POST /api/projects/:id/details, /api/milestones/:id/details and /api/project-tickets/:id/details edit text through the same checked client, service transaction and SQL repository. Text validation is shared with creation. Updates preserve IDs, parent links, creation times and statuses; ticket text changes advance updatedAt only when the text changes. No schema change is needed.

The controller allows one details editor at a time. It blocks view navigation during editing, retains the editor after failed saves and ignores older refresh responses after a save. DetailsEditor owns its draft, so a background read cannot replace entered text. Cancel only closes the editor.

The controller displays only the selected milestone's tickets. Write requests allow up to 32 KiB for multiline text; Personal keeps its 4 KiB limit. Runtime codecs check records, parent associations and manual execution mode. Manual ticket actions do not call GitHub or Codex; the optional project connection is separate.

Deletion and AI draft approval remain later Tickets.

## Keep the boundaries

TicketBlockerNotice renders a separate card notice, never a nested link inside the ticket's button. It lists unfinished prerequisites with direct ticket links and milestone context. ProjectHierarchy reuses its existing cross-milestone dialog navigation; ActionCenter can open that exact ticket through the same hierarchy. TicketBlockerEditor edits a separate manual reason through the checked client, controller, POST /api/project-tickets/:id/blocker, service validation and SQL repository. Editing blocks navigation/dismissal until Save or Cancel; failures retain the draft. Shared blocker rules exclude blocked Backlog tickets from recommendations and the final Start check. Blocker changes never change status. Done cards retain their records without displaying an active blocked notice.

Schema 8 rebuilds the ticket table with four status values and a bounded manual block_reason. It retains IDs, text, timestamps, execution mode and every prerequisite link, and restores foreign keys, indexes and same-project/cycle triggers in the same transaction. Old Ready maps to Backlog; old Blocked maps to Backlog with a retained manual notice. A verified snapshot is required before an existing database changes. Schema 7 retains the exact published draft-storage table for compatibility with draft review data; it does not enable AI planning in this build.

- Components render controls; the controller coordinates state; the client handles HTTP.
- Shared contracts/calendar code have no Node, React or feature dependencies.
- Personal and Projects business rules have no runtime SQL/HTTP dependency. Repository types describe the existing SQL adapter without adding a generic repository framework.
- SQL stays in feature repositories and the shared database schema/connection. Workspace store owns composition, transactions and database closure.
- HTTP, database and Codex infrastructure stay separate. Future features should follow actual needs rather than introduce empty frameworks.

npm run typecheck also checks static import boundaries, unresolved local imports and runtime cycles. Strict checks include unused symbols, missing returns and switch fallthrough. The dependency check covers literal TypeScript imports/re-exports and module loading; it is not a security sandbox or a complete linter.

## Codex and release work

Workspace shutdown first stops accepting HTTP requests and ends its owned connections, including incomplete JSON bodies and connections without headers. It cancels owned AI/GitHub work, waits for accepted handlers to settle, and only then closes SQLite. Close is idempotent; cancellation failures remain failures after cleanup. Accepted writes may finish before data closes, while incomplete bodies never reach task mutation. Responses to destroyed clients are ignored. Optional test-only shutdown tracing prints fixed phase names, never request bodies, credentials or paths. This protects the reproduced unfinished-request case; historical native timeouts still need evidence tied to their runs.

[src/codex](../src/codex) owns the checked stdio protocol, bounded process lifetime and fixed read-only probe. [src/ai](../src/ai) composes it for explicit account checks, managed ChatGPT sign-in and one opted-in model check. Shared AI contracts and the checked client expose only display fields, never provider responses or tokens. The sidebar dialog is available in both workspaces. Ordinary launch does not call a model.

The desktop/browser composition shares a pinned codex-product runtime and supplies CODEX_HOME from the selected app profile's codex-profile directory. Ordinary and review launches use different credential-home paths; live Windows keyring isolation remains unverified. The runtime receives an allowlisted environment without API keys, keyring credential mode and a disposable working directory. On Windows, codex/runtime.ts validates both pinned package versions and resolves the native executable directly. The owned-process launcher hides that executable and avoids the npm wrapper opening another console. Missing native files refuse setup rather than falling back to the wrapper. Sign-in cancellation closes the local protocol without waiting for a provider acknowledgement; owned-process cleanup remains bounded. Service closure stops local transport, cancels an owned sign-in or probe, drains accepted handlers and then closes the database. External links are limited to the official setup URL and validated HTTPS OpenAI/ChatGPT sign-in hosts. AI planning and writing-code gates remain unverified.

Product GitHub authorization, coding permissions/recovery, independent review and signed updates remain future work. See the [MVP task index](https://github.com/gh01wzx/focusflow/issues/28) and [validation](VALIDATION.md).

## Project action center

Projects opens ActionCenter with useActionsController. GET /api/project-actions reads all project views in one transaction; shared/actions.ts selects Review, In Progress and at most one eligible unblocked Backlog task by creation time then ID. The client checks every project view and dependency graph before use. POST /api/project-tickets/:id/start checks Backlog status and manual blockers and prerequisites inside its write transaction, using the same shared eligibility rule. Refresh responses cannot overwrite later mutations. Shared ProjectNavigation links the action center and individual projects directly; the hierarchy controller loads the selected project on entry. No AI ranking is implied.

Ticket cards open a native ProjectDialog for details, status buttons and ticket editing. EntityComposer and TicketComposer render forms only inside creation dialogs; the project sidebar owns New project. Compact milestone/ticket buttons keep the main page focused on existing work. Dialogs use native focus containment and restore focus on close; busy saves and unfinished ticket edits prevent dismissal. ProjectHierarchy owns which dialog is open; the project controller owns saved feedback and navigation actions. ProjectDialog handles native focus containment, focus restoration and dismissal.

POST /api/project-tickets/:id/prerequisites replaces that ticket's prerequisite set atomically. Service validation rejects self-links, missing/foreign parents, duplicate links and cycles. Schema 6 adds foreign keys, uniqueness, self-link checks and insert triggers for same-project/cycle protection; direct SQL updates to links are refused. SQL stays in the repository. Prerequisite changes retain the ticket's chosen status.

Prerequisite choices use native toggle buttons with aria-pressed and explicit Selected labels. Keyboard Enter/Space toggles a card. Save stays disabled until the selection changes; Cancel discards the draft. No checkbox controls or additional request/state layer are used.

## AI plan drafts

`shared/plans.ts` validates bounded suggestions, unique keys, execution-mode proposals and an acyclic within-plan prerequisite graph. `client/plans.ts` handles checked local requests. `usePlanController` coordinates explicit consent, generation, status polling and cancellation; `PlanDraftPanel` renders suggestions as text. Opening or polling a draft never calls a model.

`plans/service.ts` owns one cancellable generation, fixed progress/error messages and atomic replacement only after successful validation and process cleanup. Cancellation or failure retains the previous draft. `plans/repository.ts` stores a validated JSON document in schema 7's separate plan_drafts table. Generation and editing create no formal tasks or GitHub writes. Drafts are included in local snapshots.

`PlanDraftEditor` owns unsaved edits and selection; `PlanApprovalPreview` renders the saved selected plan before confirmation. `usePlanController` coordinates checked edit/approval requests and preserves failed-save input. Revisions reject stale edits/approvals. Missing selected prerequisites cannot be approved. `plans/approval.ts` owns validation and local approval rules with typed repositories; workspace composition supplies one transaction for all milestones, manual/coding tickets, dependencies, the approved snapshot and its durable receipt. SQL stays in repositories. Schema 10 appends plan_approvals without changing applied migrations. The draft ID makes repeated approval idempotent across lost replies and restarts. Approval never changes progress or calls a provider. Coding records retain unpublished guards. Approved snapshots survive later draft replacement for future publication work.

`plans/generator.ts` sends only the goal entered for that request. It uses `ai/service.ts` to share the single active runtime, refresh the account check and refuse non-ChatGPT authentication. `codex/read-only-probe.ts` also supports bounded text responses using the same ephemeral read-only turn, denied approvals/tools, interruption and timeout handling as the connectivity probe. Runtime setup uses an empty disposable directory and the profile's configured OS credential store. No project files are attached. Model text and provider errors are never progress messages or execution logs; only a validated draft is saved.

HTTP generation requires same-origin JSON and explicit allowance consent. Edit/approval use the same local write boundary with a bounded 1 MiB plan body. Shutdown stops transport, then aborts and awaits planning/account/publication work and accepted handlers before closing SQLite. Reopening reads local storage only. Executing suggestions retains its separate later gate; simulated protocol/API/UI checks do not verify live model quality or Windows keyring behavior.

## GitHub connection

`shared/github.ts` validates display data; `client/github.ts` handles checked local requests; `github/service.ts` owns the device grant and read-only provider calls; `github/vault.ts` stores encrypted profile credentials. Electron injects async safeStorage. Tokens never enter project SQL or renderer responses. Project links remain separate from manual task state.

`publication/service.ts` freezes only approved coding content for a repository-confirmed batch. Its typed repositories hold SQL and workspace transactions; the existing project service protects frozen text, prerequisite and repository edits. `github/issues.ts` adapts official list/create/update operations through the credential-owning serialized GitHub service. Each provider operation rechecks repository identity and visibility; no token enters publication storage or UI. Preview is read-only remotely. Approval is durable before any POST. Per-item creating/linked/published/uncertain/conflict states survive restart. An uncertain POST result permits marker reconciliation only; non-indexed paginated reads are bounded and refuse incomplete scans. A known creation refusal can remain pending for explicit retry. Final title/dependency PATCH is idempotent and refuses foreign edits. Cancellation before any creation releases an unstarted frozen batch. Shutdown aborts provider transport and awaits publication before closing SQLite. This implements publication without validating a real App permission or starting a model.

`sync/service.ts` compares owned local fields with checked Issue evidence using the publication snapshot or an explicitly accepted common baseline. SQL remains in `sync/repository.ts`; workspace composition supplies the project repository and transaction. Per-ticket read generations ignore old refresh responses. A comparison digest binds each local edit/import/PR-link choice to the currently displayed text, identities and remote evidence. Import rechecks GitHub and validates the task marker and unambiguous known fields before an atomic local write; it never overwrites a remote Issue. Provider failures retain successful evidence/timestamps with a fixed sanitized error. PR identity is linked only through an explicit same-repository closing-reference decision; refresh records actual head/merge evidence without changing status. The renderer owns unsaved input and dismissal locks; parent refresh updates the saved ticket after a successful decision. Ordinary published-ticket edits are directed through this explicit comparison flow.

GitHubConnection groups account status, repository selection, explicit confirmation and collapsible connection settings. It retains its existing request generation/busy guards. The shared scripts/github-ui.ts scenario exercises the same simulated UI in independent browser and installed review checks.

ProjectBoard renders all selected-project tickets in four horizontal status columns only when requested. ProjectHierarchy owns the Milestones/Status board choice and reuses ProjectTicketCard for cards and dialogs; shared status/blocker rules also gate recommendations and Start. Board cards include milestone context. CodingNotice renders only for coding tickets; manual cards retain status controls. ExecutionChoice edits local Backlog intent. Project service rejects coding status/Start writes, published mode changes and repository replacement. The SQL repository combines legacy task fields with the separate coding_tickets record; public clients cannot create or alter Issue identity. The shared browser/installed scenarios check card editing, coding intent, status movement, blockers and retained records after restart.
