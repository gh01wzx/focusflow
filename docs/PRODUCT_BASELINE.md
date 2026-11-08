# Product baseline

Source: the owner's Personal & Projects Tracker brief v0.1 and later approvals. This summary preserves the requirements; the original brief remains authoritative.

## Product

- Windows first, single user, local data, no Tracker account.
- Low effort daily use: open easily, show the next action, reveal detail when needed.
- Personal opens Today. Projects opens an action center with Review, running work and the next eligible Ticket.
- Source and published development records are public; personal data and credentials remain private.
- Application/source/docs are English. User-entered data keeps its language.

## Personal

- Quick dated temporary tasks, completion/cancellation and basic history.
- Pending temporary tasks remain visible until resolved and retain their planned dates.
- At least daily and weekly recurrence.
- Missed recurring periods remain recorded without accumulating overdue instances.
- Recurrence editing, timezone and week-boundary defaults need explicit design/tests.

## Projects

- Project → Milestone → Ticket; checklists/acceptance criteria, no unlimited nesting.
- Ticket fields: title, description, status, acceptance criteria, milestone, manual/Codex execution mode and optional dependencies.
- States: Backlog, In Progress, Review, Done. Blocked is an independent notice: unfinished prerequisites link to their tickets; a manual reason can be added and cleared explicitly. Only unblocked Backlog work is eligible to start.
- Manual tasks have no irrelevant GitHub/Codex controls.
- Full hierarchy and Kanban remain available behind the simpler action center.

## AI and GitHub

1. AI proposes a plan; the user edits/approves it before any Issue publication or execution.
2. Approved coding Tickets create linked GitHub Issues.
3. The user starts each Ticket individually after dependency checks.
4. Codex works in a controlled environment, tests changes and creates a branch/PR. Default: one Ticket → one Issue → one PR.
5. Review starts with a short change/test/risk summary. Deeper code questions and natural-language revisions are available.
6. Review distinguishes evidence from inference, uses actual diff/code and seeks an independent check. Evidence/approval belongs to a specific head SHA.
7. The user chooses changes or merge. Only an observed PR merge makes a coding Ticket Done and synchronizes its Issue.

Do not control existing Codex App UI/sessions or automatically start the next Ticket. GitHub/Codex authorization is separate from the local Tracker.

## Releases and quality

Current delivery is a source-only local acceptance build. The owner requested one Windows Start-FocusFlow.cmd entry, implementation of the AI workflow and unified manual acceptance after coding. Formal installation, signing, release and updating are deferred. Development does not run test suites or live model trials for this batch. This changes delivery/verification timing, not the requirement to describe unverified behavior honestly.

Formal releases are built and verified separately from PR merges. One-click update must preserve data, show progress/restart behavior and provide backup/recovery protection. Unsigned development artifacts do not prove release readiness.

Keep real Issues/PRs, a readable README, installation/architecture notes, screenshots and key automated tests/CI for the portfolio.

## MVP acceptance

- Personal works across days and restarts: recurring instances reset correctly, temporary tasks remain pending and data persists.
- A manual project can be planned, advanced and completed through the action center.
- Tracker improves itself through approved planning, Issue creation, user-started coding, PR review/revision, merge synchronization and a data-preserving formal update.

Mobile/cloud sync, Tracker accounts, multiple users, unattended execution/merge/deploy, advanced statistics, complex calendars/reminders and unlimited nesting are out of scope.
