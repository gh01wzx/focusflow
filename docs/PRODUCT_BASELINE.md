# Product baseline

Source: the owner's Personal & Projects Tracker brief v0.1 and later approvals. The latest owner decisions override the earlier brief, including the personal-use delivery scope below.

## Product

- Windows first with macOS source support, personal use, single user, local data, no Tracker account.
- Run from source with Start-FocusFlow.cmd on Windows or Start-FocusFlow.command on macOS. Personal data uses a stable profile; --review NAME opens a separate workspace that starts empty.
- Low effort daily use: open easily, show the next action, reveal detail when needed.
- Personal opens Today. Projects opens an action center with Review, running work and the next eligible Ticket.
- Source and published development records are public; personal data and credentials remain private.
- The interface supports English and Simplified Chinese. Source and docs use English. User-entered data keeps its language.

## Interface design

These choices follow findings about what people tend to prefer across cultures. The effects are modest averages, so they guide choices and never outrank clarity.

- **Curves over sharp corners.** Surfaces use the shared corner scale, with smooth (squircle) corners where the browser supports them. Icons use rounded line ends; sharp text symbols are not used as icons.
- **Easy to read.** Clear contrast, consistent alignment and familiar patterns. Text meets WCAG AA contrast (4.5:1 for small text). Card titles are short, in normal case and darker than row details.
- **Moderate complexity.** Today shows only what helps now. Before adding anything to Today, check that it does not make the page busier; management tools belong where they are used, such as the task editor.
- **Colors.** Blue and violet carry the brand. Avoid dark yellow, olive and brown, which people widely dislike; warnings use a clean red-orange.
- **Natural motion.** Animations ease like physical objects (springs or eased curves), never move at a constant speed, and respect reduced motion.
- **Good peaks and endings.** Finishing something gets a small, quiet moment, and the day and week end with a short review.

## Personal

- Quick dated temporary tasks, completion/cancellation and basic history.
- Pending temporary tasks remain visible until resolved and retain their planned dates.
- Daily and weekly recurrence; repeating tasks can also repeat monthly, quarterly or yearly.
- Missed recurring periods remain recorded without accumulating overdue instances.
- Recurrence editing, timezone and week-boundary defaults need explicit design/tests.

## Projects

- Project > Milestone > Ticket; checklists/acceptance criteria, no unlimited nesting.
- Ticket fields: title, description, status, acceptance criteria, milestone, manual/Codex execution mode and optional dependencies.
- States: Backlog, In Progress, Review, Done. Blocked is an independent notice: unfinished prerequisites link to their tickets; a manual reason can be added and cleared explicitly. Only unblocked Backlog work is eligible to start.
- Manual tasks have no irrelevant GitHub/Codex controls.
- Full hierarchy and Kanban remain available behind the simpler action center.

## AI and GitHub

1. AI proposes a plan; the user edits/approves it before any Issue publication or execution.
2. Approved coding Tickets create linked GitHub Issues.
3. The user starts each Ticket individually after dependency checks.
4. Codex works in a controlled environment and creates a branch/PR. Project checks require the owner's per-run choice; otherwise report them as not run. Default: one Ticket, one Issue and one PR.
5. Review starts with a short change/test/risk summary. Deeper code questions and natural-language revisions are available.
6. Review distinguishes evidence from inference, uses actual diff/code and seeks an independent check. Evidence/approval belongs to a specific head SHA.
7. The user chooses changes or merge. Only an observed PR merge makes a coding Ticket Done and synchronizes its Issue.

Do not control existing Codex App UI/sessions or automatically start the next Ticket. GitHub/Codex authorization is separate from the local Tracker.

## Personal-use delivery and quality

The target is a useful local tool for the owner. GitHub releases provide an unsigned Windows x64 installer and an Apple silicon disk image (owner decision, 2026-11-28). Code signing, notarization, update feeds, automatic updates and installer rollback are outside scope. Running from source stays supported.

Each platform launcher builds the source when it changed since the last successful build and opens the fixed personal profile. Named review workspaces are separate and start empty. Existing personal data retains verified migration snapshots and separate-path recovery; these remain necessary for personal use.

The owner requested implementation first and unified manual acceptance later. Local test suites may run (owner decision, 2026-11-22); live model trials stay off. Keep source, Issues/PRs and concise usage/architecture docs readable, and distinguish source delivery from verified behavior.

## MVP acceptance

- Personal works across days and restarts: recurring instances reset correctly, temporary tasks remain pending and data persists.
- A manual project can be planned, advanced and completed through the action center.
- Tracker improves itself through approved planning, Issue creation, user-started coding, PR review/revision and observed merge synchronization. Reopening the same personal profile retains tasks; no formal update or distribution step is required.

Mobile/cloud sync, Tracker accounts, multiple users, unattended execution/merge/deploy, advanced statistics, complex calendars and unlimited nesting are out of scope. Simple habit reminders from the tray are in scope (owner decision, 2026-11-22): at a habit's planned time until it is checked in, and one evening note for habits still open.
