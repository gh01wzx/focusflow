# Proposed next Tickets — not approved, started or published

The desktop direction and repository bootstrap are authorized. P0-01 is now in progress through a real GitHub Issue/PR; the remaining rows are a working breakdown and are not automatically started or batch-published. Existing feasibility work is recorded honestly as a spike, not fabricated historic Issues/PRs.

| ID | Phase | Small outcome / acceptance | Depends on |
| --- | --- | --- | --- |
| P0-01 | 0 | Confirm owner/name and public repository authorization; inspect intended source list, create public repo, import spike as such, enable CI and observe a real passing Windows run | User decision and GitHub access |
| P0-02 | 0 | Pin supported official Codex executable/version; with approved login, run one read-only disposable model turn; demonstrate streamed result, cancellation, approval handling and quota/auth failure | Explicit account authorization |
| P0-03 | 0 | Pin Electron/database/packager versions; produce two local Windows installers; validate double-click launch, data outside install path, signed release constraints, A→B update and failed migration recovery | Approved architecture; signing decision |
| P1-01 | 1 | Install desktop shell and versioned database; empty/first launch, persistence and migration rollback checked | P0-01/03 |
| P1-02 | 1 | Add/complete/cancel dated temporary tasks; overdue pending items retain original date and survive restart | P1-01 |
| P1-03 | 1 | Daily/weekly recurrence with an injectable local calendar clock; no duplicate period, missed-history retained, no old backlog after offline days; test DST/timezone policy | P1-02; recurrence default approved |
| P1-04 | 1 | Create/edit three-level manual project structure with required Ticket fields; statuses persist; reject dependency cycles | P1-01 |
| P1-05 | 1 | Action center prioritizes Review/running/one eligible next Ticket; dependencies respected; manual tasks have no code controls | P1-04 |
| P2-01 | 2 | Display editable AI plan draft; cancel/approve behavior proven; no Issue publication before approval | P0-02, P1-04 |
| P2-02 | 2 | Approve GitHub login; repository association and one approved Ticket→Issue write; timeout retry reconciles to one Issue, drift shown | P0-01, P2-01; external writes authorized |
| P3-01 | 3 | User-started one-Ticket worktree/run with live progress, explicit approvals, cancellation/failure states and restart reconciliation | P0-02, P2-02 |
| P3-02 | 3 | Real test evidence, branch push and one PR tied to the Ticket; block incorrect completion | P3-01; authorized remote writes |
| P3-03 | 3 | Fresh-context AI review plus questions about actual code/dependencies; evidence labels and SHA invalidation; natural-language revisions keep same PR | P3-02 |
| P3-04 | 3 | GitHub merge synchronization marks Done; closed-unmerged PR stays incomplete; improve Tracker itself with one tiny real PR | P3-03 |
| P4-01 | 4 | Formal release build/verification, explicit one-click update; full existing-data and recovery acceptance scenario | P0-03, P3-04 |
| P4-02 | 4 | Portfolio README/screenshots/architecture, user installation guide, actual CI evidence and self-improvement demo | P4-01 |

Each row is a candidate outcome; split a row again before execution if its diff would be hard to review. The Phase 0 packaging experiment validates feasibility only; shipping the full updater remains Phase 4.
