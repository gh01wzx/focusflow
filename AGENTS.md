# FocusFlow development rules

- The user-approved product brief is the baseline. `docs/PRODUCT_BASELINE.md` records its constraints; do not silently expand scope.
- The owner approved the desktop direction on 2026-11-03. `docs/PHASE0_REPORT.md` proposes the Phase 0 closeout and bounded Phase 1 handoff in Issue #17. This boundary takes effect only after the owner merges its PR; writing the proposal does not approve it. Until then, do not start Phase 1 features.
- After that owner-approved closeout merge, local Personal/manual Projects may proceed through individually authorized Tickets. Product GitHub authorization, AI coding permissions/approvals/recovery, and formal signing/updating remain blocking gates on Phases 2, 3 and 4 respectively. Never describe them as verified by a local-task feature. Follow the first Today slice and data-isolation acceptance in the closeout report.
- On 2026-11-03 the owner explicitly authorized the public repository `gh01wzx/focusflow` and continued desktop development. GitHub login and public repository access are verified. Do not ask for the same repository authorization again. Other account scopes and remote operations must stay within the approved product workflow; no automatic merge or deployment.
- Never commit user databases, tokens, credentials, personal configuration or execution logs. Keep release/user data outside source in the installed product.
- Use small Tickets and small PRs after repository setup. Never auto-start a second programming Ticket or auto-merge.
- Use TypeScript for application, browser, integration and test source. Enable strict compiler checks; generated JavaScript belongs only in ignored build output.
- Use English for source identifiers, comments, application text, error messages, documentation, Issues, commits and PRs. Only the conversation with the owner is Chinese. Preserve user-entered content in its original language; represent non-English test fixtures with Unicode escapes.
- A coding Ticket becomes Done only on observed GitHub merge, not Issue closure, model completion or a local status edit.
- Distinguish observed test evidence, code observations, model inference and unverified claims. Bind review evidence to a commit SHA and invalidate approval when that SHA changes.
- Run `npm run check:language`, `npm run typecheck`, `npm run build` and `npm test` for code changes. `npm run test:source` can additionally exercise TypeScript source on Node 24, but runtime type stripping is not type checking. Use disposable temporary directories for tests. No live model or authenticated GitHub write is part of the ordinary test suite.
- Do not implement a custom installer/updater before validating maintained desktop tooling and its signing requirements.
- The Phase 0 browser UI and experimental SQLite driver are not permanent architecture commitments.
