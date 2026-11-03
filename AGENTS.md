# FocusFlow development rules

- The user-approved product brief is the baseline. `docs/PRODUCT_BASELINE.md` records its constraints; do not silently expand scope.
- This directory currently contains a Phase 0 local feasibility spike. The owner approved the desktop application direction on 2026-11-03. Complete the integration and packaging validation gates before Phase 1 product features.
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
