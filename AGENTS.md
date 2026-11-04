# FocusFlow development rules

- Follow [the product baseline](docs/PRODUCT_BASELINE.md); do not expand scope silently.
- Phase 1 local Personal/manual Projects are approved by observed PR #18 merge at 2a538a76d3a533dac3d6e33fb70765f0d5d20b11. Today PR #20 merged at fde0fe128e420e6e175c13f630bf0e5e28e05e3a; the owner authorized continuation. Repeating-task PR #23 merged at 323c94a8762a5b4265d4fb8301a5556a460a886f. Refactor PR #25 merged at ba73d51474db48e2f4377c079f2bbcf8b7e3f5a8. The owner explicitly approved current Ticket #26: project/milestone/manual-ticket creation, acceptance text, manual status changes and persistence. Action center, dependencies and AI are later Tickets.
- Product GitHub authorization, coding permissions/approvals/recovery and formal signing/updating still gate Phases 2, 3 and 4. A local-task feature does not verify them.
- The owner authorized public gh01wzx/focusflow and desktop development on 2026-11-03. Do not repeat that authorization request. New account scopes and external actions must stay within the approved workflow.
- Work on one individually authorized Ticket at a time, using small PRs. No automatic next-Ticket start, merge or deployment. A coding Ticket is Done only after its linked PR is observed merged.
- Write Tickets as user stories: lead with what the user can do and observable acceptance steps. Keep implementation details in the PR's expandable engineering notes.
- Use the Issue number as the task ID. Start Issue/PR titles with [ID] and branches with ID- followed by a short English outcome, for example [21] Create tasks that repeat daily or weekly and 21-repeat-daily-or-weekly. GitHub's separate PR number is only a platform reference; link the Issue with Closes #ID. Apply this from task 21 onward.
- Keep components, state coordination, HTTP, task rules and SQL separate. Follow docs/ARCHITECTURE.md and the automated dependency checks; add abstractions only for current needs.
- Never commit databases, credentials, personal configuration, execution logs or installer output. Installed user data stays outside source/install directories.
- Use strict TypeScript for first-party app, browser, integration and test code. Generated JavaScript belongs only in ignored build output.
- Use English in source, comments, UI, docs, Issues, commits and PRs. Conversation with the owner is Chinese. Preserve user-entered text; escape non-English test fixtures.
- Separate executed tests, code observations, model inference and unverified claims. Bind review evidence/approval to a commit SHA; changes invalidate approval.
- For code changes run npm run check:language, npm run typecheck, npm run build and npm test. Optional test:source is not type checking.
- Tests use disposable directories. No live model or authenticated GitHub write in ordinary tests.
- Validate maintained desktop/signing tooling before considering a custom installer/updater. SQLite driver and interface choices remain reviewable engineering decisions.
