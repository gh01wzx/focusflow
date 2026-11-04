# First Today slice (Issue #19)

Scope: temporary dated tasks only. The owner approved the Phase 0 handoff by merging PR #18 at `2a538a76d3a533dac3d6e33fb70765f0d5d20b11` and explicitly requested continuation.

The product starts in Personal / Today. Add, complete and cancel are persisted before the UI reports success. Pending tasks keep the original planned date, appear in Today when due or overdue, and remain pending across offline days. Upcoming lists future pending tasks; History shows completed/cancelled tasks and their original dates. Repeated resolution to the same state is idempotent; conflicting terminal changes are rejected. Editing, reopening and recurrence are later slices.

The Node process is the calendar authority, using the computer's local date. The renderer refreshes on focus, visibility changes and every 30 seconds while visible. Date-only values remain date-only; completion/creation times are UTC instants. Calendar tests cover an Auckland midnight and daylight-saving transition without relying on the CI machine's default timezone. A timezone setting/recurrence policy is not added here.

Product profile: `%LOCALAPPDATA%\FocusFlow\desktop`; database: `data\tracker.db`. Its SQLite application ID and format marker distinguish it from the Phase 0 note store. A new app ID/executable/shortcut separates product installation from the spike. No spike notes or Codex credentials are imported. A same-path foreign/newer database is refused without writes. The preserved browser spike is explicit developer tooling.

Schema 1 is a synthetic earlier product schema for tests, not a previously shipped product version. Schema 2 adds the query index. SQLite fixtures and Windows installed-app checks verify schema-1 tasks survive migration, a verified schema-1 snapshot is retained, and it can be restored/read separately without changing the upgraded source. Older migration plans refuse the newer schema. These checks replace the old note-only A/B job for the product pipeline; immutable Phase 0 evidence remains linked in the closeout report and the generic migration tests remain active.

The UI is React/TypeScript, built with pinned esbuild. There is no renderer Node access, preload, model call, app-owned GitHub connection or updater. Assets are local. User text is rendered as text, never HTML. Pending controls disable while mutations are in flight; failures preserve input and expose a retry. A generation guard prevents a stale background refresh overwriting a newer mutation result.

The Electron shell destroys its renderer before waiting for the local HTTP service on quit, releasing browser connections. Installed checks log stages and bound launch, selectors, second instance and close; installer waits target the owned setup process and are bounded. A forced test cleanup is a failed smoke result, not an accepted graceful close.

Validation must be recorded against the final PR head. Local backend/type checks and 42 compiled tests passed before publication. Initially, full local renderer checks were blocked by missing newly pinned React/esbuild packages and restricted registry access; hosted verification is recorded separately. No missing dependency is replaced by a fake type declaration or claimed as a successful build. The exact-head CI result and installed-app smoke reports determine what has passed.

The first installer is `0.1.0-alpha.1`, an unsigned development build with publication disabled. It is not a formal MVP release. Recurrence, Projects, planning, coding/review and update acceptance remain open. Packaging dependency advisories and actual coding-sandbox/provider-error behavior retain their separate gates.
