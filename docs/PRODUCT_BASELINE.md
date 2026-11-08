# Product baseline

Source: the owner's Personal & Projects Tracker brief v0.1 and later approvals. The latest owner decisions override the earlier brief, including the personal-use delivery scope below.

## Product

- Windows first, personal use, single user, local data, no Tracker account.
- Run from source through one Start-FocusFlow.cmd entry. Personal data uses a stable profile; --review NAME opens separate sample data.
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
4. Codex works in a controlled environment and creates a branch/PR. Project checks require the owner's per-run choice; otherwise report them as not run. Default: one Ticket → one Issue → one PR.
5. Review starts with a short change/test/risk summary. Deeper code questions and natural-language revisions are available.
6. Review distinguishes evidence from inference, uses actual diff/code and seeks an independent check. Evidence/approval belongs to a specific head SHA.
7. The user chooses changes or merge. Only an observed PR merge makes a coding Ticket Done and synchronizes its Issue.

Do not control existing Codex App UI/sessions or automatically start the next Ticket. GitHub/Codex authorization is separate from the local Tracker.

## Personal-use delivery and quality

The target is a useful local tool for the owner, not a distributed app. Formal installers, signing, public releases, update feeds, update installation and installer rollback are outside scope. They do not block feature completion or personal use.

Start-FocusFlow.cmd builds source and opens the fixed personal profile without sample seeding. --review NAME opens separate examples for optional local acceptance. Existing personal data retains verified migration snapshots and separate-path recovery; these remain necessary for personal use.

The owner requested implementation first and unified manual acceptance later. Do not run test suites or live model trials for this batch. Keep source, Issues/PRs and concise usage/architecture docs readable, and distinguish source delivery from verified behavior.

## MVP acceptance

- Personal works across days and restarts: recurring instances reset correctly, temporary tasks remain pending and data persists.
- A manual project can be planned, advanced and completed through the action center.
- Tracker improves itself through approved planning, Issue creation, user-started coding, PR review/revision and observed merge synchronization. Reopening the same personal profile retains tasks; no formal update or distribution step is required.

Mobile/cloud sync, Tracker accounts, multiple users, unattended execution/merge/deploy, advanced statistics, complex calendars/reminders and unlimited nesting are out of scope.
