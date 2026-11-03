# Product baseline — 2026-11-03

Source: Jack's “Personal & Projects Tracker — MVP 产品需求与 Codex 开发交接”, version 0.1, supplied in this conversation. This is an implementation reference summarizing that brief, not a replacement approval or an amendment to it. The full supplied brief remains the requirement authority.

## Confirmed constraints

- Windows single-user, local-first; no Tracker account, mobile app or cross-device sync in MVP. Necessary Codex/GitHub authorization remains separate.
- Low interaction cost, easy daily launch, progressive detail. Desktop or local web selected through Phase 0.
- Separate Personal and Projects. Personal opens Today. Projects opens action center: Review, running work, next executable Ticket, access to hierarchy/Kanban.
- Personal: at least daily/weekly recurrence, quick dated temporary tasks, check to complete, necessary completion history. Old recurring occurrences do not accumulate; previous unfinished period remains recorded. Temporary unfinished tasks stay pending until complete/cancelled.
- Project → Milestone → Ticket; no unlimited nesting. Tickets contain title, description, status, acceptance criteria, milestone, execution mode and optional dependencies.
- Backlog, Ready, In Progress, Review, Done, Blocked. Non-code work advances manually without GitHub/Codex controls.
- AI planning stays a draft until user confirmation; no Issues or execution before approval. Approved coding Tickets get linked GitHub Issues.
- User explicitly starts each coding Ticket, with dependency checks. One Ticket → one Issue → one branch/PR by default; exceptions explicit.
- Separate controlled Codex execution, appropriate tests, observable results and clear failures. Do not assume control over existing App UI/sessions.
- Lightweight review summary by default, deeper diff/code/library questions on demand, natural-language revisions. Clearly label evidence and inference; seek independent review.
- User decides merge/modification. Done only after actual PR merge; synchronize Issue state afterwards.
- Updating applies to built, validated formal releases, not every merge. One-click aspiration, preservation of data, backups, failure recovery and restart feedback require validation.
- Public source repository from first formal development day with real commit/Issue/PR history, README, tests, CI and portfolio documentation. User data and credentials stay private.
- No automatic chained Ticket execution, unattended merge/deploy, complex reporting/reminders, multiple users or role systems.

## Ordered gates

0. Technical validation, reproducible minimal skeleton, architecture choices and blockers. Repository creation waits for owner/name/explicit public authorization. User approves architecture and subsequent Ticket list before product development.
1. Daily usable Personal and manual Projects/action center.
2. Reviewed AI planning and linked GitHub Issues.
3. User-started Codex → test/PR → AI review → revise/merge/sync; a real tiny Tracker self-improvement closes the loop.
4. Windows release, one-click update and data recovery, presentation material.

## Proposed defaults, not separately approved

- Keep original planned dates for overdue temporary tasks; make history viewable.
- Product name/repository suggestion: FocusFlow / `focusflow`.
- Recurrence follows local calendar days and a configured timezone; Monday-based weeks, no catch-up pile after several offline days. Timezone changes, recurrence edits and DST need explicit behavior and tests in Phase 1.
- Return cancelled coding runs to an explicit stopped/blocked execution state; do not pretend the business workflow completed. Lost connections and PR closure without merge must remain recoverable.

Acceptance remains the three scenarios in the supplied brief: Personal across days/restart; manual non-code project planning/progression; and Tracker improving itself through the full coding/review/merge/release/update loop without data loss. None is claimed complete in Phase 0.
