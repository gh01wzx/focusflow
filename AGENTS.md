# FocusFlow development rules

## Product and authorization

- Follow [the product baseline](docs/PRODUCT_BASELINE.md). Keep Windows-first, single-user, local-first scope.
- Local Personal and manual Projects are approved. Product GitHub authorization, coding permissions/approvals/recovery and formal signing/updating retain their separate phase gates. A local feature does not verify those gates.
- The owner authorized public gh01wzx/focusflow and desktop development on 2026-11-03. Do not repeat that authorization request. New account scopes and external actions stay within the approved workflow.

## Work with the owner

- Discuss the work in Chinese. Use simple English in source, comments, UI, docs, Issues, commits and PRs. Preserve user-entered text; escape non-English test fixtures.
- By default, work on one owner-selected Issue at a time in a small PR; the owner chooses the next task and merge. An explicitly authorized batch may proceed in dependency order with self-review and passing required checks before each merge. Keep one implementation Issue/PR at a time. Batch merge permission does not authorize new account scopes, live-model spending, paid services, release or deployment.
- A coding task is complete only after its linked PR is observed merged.
- Use the Issue number as the task ID: [ID] Plain-English outcome for Issue/PR titles, ID-short-outcome for branches, and Closes #ID in the PR. GitHub's separate PR number is only a platform reference. Apply this from task 21 onward.
- Keep lasting rules here. Keep task status, approvals and development history in GitHub rather than adding a chronological log to this file.

## Explain and finish the work

- Issues explain why the user needs the change, what they can do, and observable steps to check it. Explain unfamiliar terms instead of relying on abbreviations.
- PRs lead with what changed, how to try the exact build, and known problems. Put implementation details in expandable engineering notes.
- Follow the [document responsibilities](docs/DEVELOPMENT.md#where-information-belongs). Keep plans in Issues and change-specific results in the corresponding PR.
- When replacing an implementation, remove unused code and repair affected references, tests, commands and docs in the same change. Retain required migrations, compatibility behavior and tools with a current consumer.
- After merge, update the affected Issue/overview state. Avoid copying temporary PR status across documents.
- Separate executed checks, code observations, owner-reported results and inference. Bind verification and approval to a commit SHA; changes invalidate earlier approval.
- A retry passing does not diagnose a failure. A temporary workaround is not a permanent fix. Stop repeated native launches after a crash and record a controlled next experiment.

## CI cost and notifications

- The owner requires no paid CI usage. Automatic workflows run only in public repositories on standard GitHub-hosted Windows/Linux runners. Keep persistent artifact uploads and caches disabled. Paid runners, storage and external services require explicit owner approval.
- Run feature changes through pull_request and merged code through push on main. Cancel superseded runs for the same PR. Keep real failures visible. Personal email notification settings and billing budgets are separate account controls; never claim they changed without observing the change.

## Code and data

- Keep components, state coordination, HTTP, task rules and SQL separate. Follow [Architecture](docs/ARCHITECTURE.md) and dependency checks; add abstractions only for current needs.
- Use strict TypeScript for first-party app, browser, integration and test code. Generated JavaScript belongs only in ignored build output.
- For code changes run npm run check:language, npm run typecheck, npm run build and npm test. Optional test:source is not type checking. Use relevant language/link checks for documentation-only changes.
- Tests use disposable directories. Ordinary tests never use a live model or authenticated GitHub writes. Review instructions must identify the build and data profile.
- Never commit databases, credentials, personal configuration, execution logs or installer output. Installed user data stays outside source/install directories.
- Preserve existing weekly schedules and applied database migrations. New schema changes append migrations and retain verified backup/recovery protection.
- Validate maintained desktop/signing tooling before considering a custom installer/updater. SQLite driver and interface choices remain reviewable engineering decisions.
