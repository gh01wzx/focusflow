# Using FocusFlow

Personal and manual Projects work locally without a GitHub or AI account. Double-click Start-FocusFlow.cmd for the source acceptance build; see the [README](../README.md). Coding and review have new, untested implementations. Installation, release and updating are deferred.

## Repeating tasks

Choose **Repeat** and a start date of today or later. Daily tasks reset at local midnight. For **Weekly**, select one or more weekdays, such as Mon, Tue and Sat. Each selected date is a separate task, starting on the first matching date on or after the start date. Unselected days have no task. Dates follow the computer's current local timezone.

Existing weekly schedules retain their original seven-day periods after upgrading. Their schedule list explicitly identifies this behavior; editing weekdays is not available.

Completing/cancelling affects one occurrence. Unfinished periods become **Missed** in History; reopening catches up closed-app periods without overdue accumulation. Temporary tasks keep their original dates and stay pending.

Expand **Repeating tasks** to stop a schedule. Its current-period task stays available; a future first occurrence is cancelled. History is retained. Upcoming shows the first scheduled task, not an infinite preview.

## Manual projects

Choose **Projects** to see three horizontal columns: Review, In Progress and one recommended unblocked Backlog ticket across all projects. Each column has its own border, background and count. Smaller windows can scroll the columns horizontally. Lists use creation time, oldest first, with ticket ID breaking ties. Expand View details for descriptions and acceptance criteria. Start ticket moves only the chosen Backlog ticket to In Progress; nothing starts automatically. A Backlog ticket can start only when its prerequisites are Done and no manual blocker remains.

Select a project directly in the sidebar to open its milestones and tickets. **New project** is in the sidebar only. Compact **New milestone** and **New ticket** buttons open separate creation dialogs, keeping the main page focused on existing work. **Action center** stays in the sidebar to return to the overview. Open a ticket card for its description and acceptance criteria. Use its status buttons to move between Backlog, In Progress, Review and Done. Descriptions and acceptance criteria support multiple lines.

The sidebar selects a project; the milestone selector limits the visible ticket list. Manual tickets have no GitHub/Codex controls. Everything stays in the local database across restarts. Switching workspaces starts their default view; unsaved form drafts are not retained across workspace changes. Choose Status board to browse tickets from all milestones in four horizontal status columns. Normal windows show all four columns together; narrower windows show Previous columns / Next columns controls above the cards. Each card shows its milestone and opens the same details/status controls. Milestones returns to the focused list; Action center stays the default.

Use **Edit project**, **Edit milestone** or **Edit ticket** inside a ticket's details dialog to correct its title and details. Tickets also allow editing acceptance criteria. **Save changes** keeps the same identity, parent and status, including Done; **Cancel** discards the draft without saving. A failed save keeps your input. Save or cancel an edit before switching projects, milestones or workspaces.

Use **Set prerequisites** in a ticket's details to choose work that must finish first. Click task cards to select or remove them; Selected cards show the saved choices when you reopen the picker. Links stay within the same project, including different milestones. Self-links and circular chains are rejected. Unfinished prerequisites appear by title; click one to open its details. A Backlog ticket is recommended and startable only when every prerequisite is Done and no manual blocker remains. Blocked is a notice, not a status or column. The card lists unfinished prerequisite titles and milestone names as clickable links. Links open the exact ticket, including across milestones; the action center uses the same links. Completing prerequisites removes that notice without changing status or starting work.

Use **Add blocker** inside a ticket for waiting on something outside the project. Save a reason, edit it later or choose **Clear blocker** explicitly. Manual blockers stay visible until cleared, even after prerequisites finish. A failed save keeps your input; Cancel discards it. Blockers can appear on Backlog, In Progress and Review cards. Done cards keep their saved reason and dependency records without displaying an active blocked notice.

Choose **Work type** when creating or editing an unpublished Backlog ticket. **Manual** keeps the usual status controls. **Coding with Codex** saves an unpublished draft without an Issue or run. Unpublished drafts cannot start. Published eligible coding tickets appear in the action center; their Start control opens details for explicit workspace and allowance confirmation. Their GitHub Issue number is the task ID; repository identity and work type remain fixed after publication. Coding progress uses dedicated controls and an observed merged PR is required for Done.

Existing data upgrades only after a verified pre-change backup. Old Ready tickets become Backlog; old Blocked tickets become Backlog with a manual blocker that you must explain or clear. IDs, text and dependency links remain. Named reviews use sample data separated by the current database format; previous formats remain untouched.

## AI connection preview

Open **AI connection** in the sidebar to check the separate FocusFlow Codex account. Install the pinned official runtime explicitly with npm run ai:install from a source checkout, then choose **Sign in with ChatGPT** and follow the browser link. The shared runtime stays under %LOCALAPPDATA%\FocusFlow\codex-product\runtime. Each app profile supplies its own codex-profile directory for sign-in settings. Live Windows credential-store separation still needs verification. Credentials use the OS credential store; no plaintext fallback is configured and existing Codex App sessions are not copied.

**Check account** does not request a model response. **Run read-only AI check** requires the allowance checkbox and a ChatGPT-authenticated account. It consumes Codex allowance; API-key and other auth modes are refused. Coding uses a separate explicit Start decision. The product login/keyring/live path still needs owner-led Windows acceptance; launching the app never starts a model request.

## AI plan drafts

Open a project and choose **AI plan draft**. Enter a goal, confirm that generation uses Codex allowance, then choose **Generate draft**. Only the entered goal is included in the planning prompt. It is sent to OpenAI through the pinned Codex runtime; project files, existing tasks and GitHub credentials are not attached. Each request checks for a ChatGPT account again. API-key billing is refused.

Progress and **Cancel generation** remain visible while waiting. Closing the dialog requests cancellation too. A request already sent may use allowance. There is no automatic retry after failure, cancellation or reopening. Provider-internal retry progress may appear during an existing request.

A valid result is saved only in this data profile, separately from project milestones and tickets. Reopen the dialog to read it without another model call. Expand suggestions to see descriptions, acceptance criteria, proposed Manual/Coding modes and prerequisite titles. Failed or cancelled replacements keep the previous draft and all existing tasks. Generating creates no approved tasks, GitHub Issues, pull requests or coding runs. Live response quality and Windows credential-store behavior still require an owner-triggered trial; automated checks use simulated replies.

Choose **Edit draft plan** to correct milestone/task text, acceptance criteria, work types and prerequisite links. Clear **Include task** to exclude an unwanted suggestion. Save draft changes keeps those choices across restarts without creating project tickets. Cancel discards unsaved changes; failed saves retain your input. Save or cancel before closing the editor. A draft changed elsewhere must be reopened before saving or approving.

Choose **Preview selected plan** to inspect exactly which milestones and tasks will be created. Excluded prerequisites must be included or their links removed explicitly. Confirm the checkbox and choose **Approve selected plan**. The selected plan is saved together in Backlog with its dependencies. Nothing starts or publishes to GitHub. Coding tasks remain unpublished and unstartable. Repeated approval, a lost reply or restarting cannot duplicate that plan. A failed write saves none of the plan; reopen to check its approval result before retrying. Approved drafts cannot be edited again; edit their saved tickets or generate a new draft instead.

## Publish approved coding work

Open **Publish approved work**, then **Preview publication**. Connect GitHub with Issues write access through your App or fine-grained token. Inspect repository visibility and each public Issue, then approve the batch. The preview includes coding tickets you saved directly or approved from a plan. Unapproved AI suggestions, Personal data, goals, project notes and manual task text are excluded. Publication never starts coding or grants account permissions.

GitHub assigns each Issue number after creation; the final title uses [ID] and coding prerequisite references use assigned numbers. The preview explains these substitutions and shows the public recovery marker. Results are saved per task. Reopen after restart or **Resume approved publication** to recover missing links, without duplicating successful creations. A definite refusal retains uncreated work for an explicit retry. An uncertain creation is searched by its marker; absence does not permit another creation. Conflicting/duplicate markers or remote edits require reconciliation. A wholly unstarted batch can be cancelled before revising its preview. Approved publication content and repository are locked; linked requirement changes use the explicit comparison flow. No product live-write trial is claimed by simulated tests.

## Compare linked work

Open a published coding ticket and choose **Compare linked work**, then **Refresh linked work**. The panel shows the last successful refresh, saved GitHub Issue state/body, local fields and which side changed since a known common version. Offline, expired/revoked access and rate-limit failures keep the previous evidence visible with an error. Opening the panel reads local state; refreshing reads GitHub without writing or calling a model. Manual tickets have no comparison controls.

Use **Edit local requirements** to confirm a local proposal, or confirm **Use GitHub fields locally** to copy recognized public fields deliberately. Both retain Issue/task identity, prerequisites, mode and progress. The remote version is checked again before adopting it; changed/stale comparisons are refused. Unknown or ambiguous Issue formats cannot be imported silently. FocusFlow never overwrites the Issue during comparison: use **Open Issue on GitHub** for a deliberate public edit, then refresh. Save or cancel local edits before closing; a failed save retains the draft.

If an existing PR belongs to this ticket, enter its number and explicitly choose **Inspect and link this PR**. It must explicitly close this Issue in the same repository; an existing PR identity cannot be replaced silently. Refresh retains its actual head, state and merge commit across restart. Issue closure and a closed unmerged PR do not mean Done. The coding review panel reconciles an actual merged PR separately.

## Code and review one ticket

This is the implemented acceptance path, not a report of successful live testing.

1. Connect the project repository, publish its coding Issue and finish its prerequisites. Clear any manual blocker.
2. Open the ticket, enter the absolute path of its local Git repository and inspect it. Confirm the displayed base commit and prepare a worktree. Uncommitted source-folder edits stay in that folder and are excluded. The separate worktree is retained inside the app profile.
3. Inspect the ticket/workspace scope, confirm ChatGPT allowance and choose Start. Checks are off by default. One coding run is allowed globally; there is no automatic next task or model retry.
4. Follow saved progress and distinguish the developer's summary from runtime-reported command results. Allow once or deny a specific pending permission. Unknown/out-of-worktree requests are refused by the adapter; actual Windows sandbox enforcement still needs validation.
5. Stop requests interruption and owned-process cleanup. Reopening never restarts a model. An interrupted run retains its files, identities and history. Uncertain process/publication state blocks another run until explicitly reconciled; a stale PID is never killed or reattached automatically.
6. Preview source publication. Confirm repository visibility, base and exact changed-file list before creating a branch/PR. This sends the approved snapshot to GitHub. A lost PR-create reply only searches for the existing recovery marker; it does not create a duplicate. External branch changes are preserved and block silent replacement.
7. Refresh PR review to read actual head-bound diff and check results. Missing, truncated or failed evidence remains visible. Explicit allowance consent enables a plain-English summary, a separate read-only AI assessment or a code/library question. These use bounded supplied evidence and do not run tests. AI answers are inferences, not proof of correctness.
8. Enter revision feedback, preview its scope and explicitly resume a fresh coding context in the same worktree. Publish the revision to the same PR. Changed head or requirements invalidates earlier answers/approval.
9. Record a local approval only after inspecting current evidence. Missing check/source/review evidence needs acknowledgement. Open the PR on GitHub and merge there when satisfied. Refresh/observe its result: only an actual matching PR merge makes the coding ticket Done. If GitHub did not close the linked Issue, explicitly close it after the observed merge. No next task, installation or update starts.

File/secret screening is bounded and cannot guarantee every sensitive value is recognized. Inspect publication content and permissions yourself. All files, process state, GitHub permissions, cancellation and recovery behavior in this new path await local acceptance.

## Try a proposed change

In the checkout for the PR you are reviewing, run:

~~~powershell
npm ci
.\Start-FocusFlow.cmd --review pr-72
~~~

Use the name given in the PR. The equivalent command is npm run review -- pr-72. The window shows **Sample data - Review pr-72** in its title and a yellow **Sample data** notice above both workspaces.

The first run creates a few Personal examples and **Sample project** with three milestones and 12 manual tickets covering all four statuses. Open the project and choose **Status board** to see them together. Examples include a Backlog ticket waiting for a prerequisite in another milestone, a manual blocker and an active ticket with a completed prerequisite. Descriptions explain what to try; each ticket includes acceptance steps.

Fresh sample profiles also include a saved example under **AI plan draft**. Edit, exclude, preview and approve it without installing Codex, signing in or calling a model. Its three suggestions are separate from the 12 existing sample tickets until you approve them. Existing sample data is never topped up or reset.

Add, complete or change examples freely. Reopen with the same name to keep your changes; a different name starts a separate workspace. Review names use letters, numbers and hyphens. Existing review databases are never topped up or reset. To get newly added examples, use a new review name, such as task-41-four-states.

An installed build also supports review mode:

~~~powershell
& "$env:LOCALAPPDATA\Programs\FocusFlow\FocusFlow.exe" --review pr-72
~~~

Use the actual installation path if it differs. Opening the installed app normally still uses your everyday tasks. Source development, named review and installed everyday data are separate; your existing everyday data is not moved or copied. To return to it after using the source launcher, open the installed app normally.

Review/development folders are also separated by database format. A format change starts fresh sample data rather than upgrading another format's review workspace. See [Development](DEVELOPMENT.md#data-paths) for paths and deliberate migration trials. Earlier builds without review mode must use their documented disposable-test setup; do not assume they understand the new review command.

