# Using FocusFlow

Open `Start-FocusFlow.cmd` to build and open your everyday workspace. Personal and manual project work are available as soon as the local app opens. See [the README](../README.md) for setup.

## Personal

**Today** shows open tasks. Add a title and a date. Use **Upcoming** for future tasks and **History** for resolved tasks. A missed one-off task keeps its original date and stays open until you complete or cancel it.

After you complete or cancel a task, choose **Undo** next to the message to reopen it. **History** also offers **Reopen** for one-off tasks and for a repeating occurrence while its period is current. Reopening a completed task returns the points it earned. History shows the latest 200 resolved tasks; older records stay saved.

Add a daily or weekly **Repeat** to create a schedule. Weekly schedules let you choose one or more weekdays. Daily and selected-weekday occurrences follow the local calendar. Older weekly schedules keep their original seven-day periods. A missed period is recorded once. To end a schedule, expand **Repeating tasks**, choose **Stop repeating** and confirm. Completing or cancelling an occurrence affects only that occurrence.

Select **Log minutes each day** when adding a repeating habit. The default target is five minutes at one point per minute. Use **Points settings** to change the target, rate or cue. Each saved session can earn points, including sessions after reaching the daily target. The last seven days show minutes against each day's progress. A future habit occurrence in **Upcoming** is logged on its day. New one-off tasks start with a five-point completion rule. Older tasks earn points after you set a rule.

**Rewards** lets you add and price your own rewards. The jar shows points earned on the current date. The available balance carries forward and pays for redemptions. **Archive** asks for confirmation and removes a reward from the shop while keeping its history. In **History > Points history**, open **Correct log** to adjust minutes or move a duration entry to another scheduled date. The correction uses the original rate. You can also undo supported entries after confirming. Use **Feedback settings** for sound, volume and reduced motion.

## Projects

The **Action center** lists tickets waiting for review, work in progress and the next eligible Backlog ticket. Start a manual ticket to move it to **In progress**. Open the ticket to read its description and acceptance criteria. For coding tickets, use the run panel inside the ticket.

Choose **New project** in the sidebar, add a milestone and then create a ticket. Use the milestone selector and **New ticket** in either the milestone list or the status board. The board shows all milestones. A ticket uses Backlog, In progress, Review or Done. To change the title, description or acceptance criteria, open its details and choose **Edit ticket**. A failed save keeps your draft.

**Set prerequisites** links a ticket to work that needs to finish first. **Add blocker** records an external reason. Follow a blocker link to the exact ticket. A Backlog ticket becomes eligible once its prerequisites are Done and its manual blocker is cleared. Starting it remains your choice.

To remove a project, choose **Delete project** and type its name. This permanently removes its local tasks and project history. GitHub Issues and pull requests, and the worktree files, stay available.

## Optional connections

Open **Settings > AI connection**. For Codex, run `npm run ai:install` from the source checkout and follow **Sign in with ChatGPT**. Uses are charged to the selected ChatGPT Codex allowance. For DeepSeek, install the CLI shown in the dialog and save a key there, or supply the existing `DEEPSEEK_API_KEY` environment setting. Compatible API connections can use a configured endpoint and key. These requests use the selected API balance. The desktop protects saved API keys with the Windows user credential mechanism.

Open **GitHub connection** in the project to authorize an account and link a repository. The app prompts for explicit approval before publishing. [GitHub setup and permissions](GITHUB_CONNECTION.md)

## Plan and run work

- **AI plan draft** turns a project goal into an editable proposal. Check the model and effort before generating. Review selected milestones, tickets and dependencies before approving the draft.
- **Run AI** in a ticket can break the work into smaller tickets or produce a written result. Assign every original acceptance item to a selected child before creating tickets.
- **Context and settings** holds project requirements, local repository, preview command and separate model choices. **Read repository references** shows excerpts from committed documents. Edit an excerpt and save settings to add it. This read uses no model calls.
- Use **Run coding ticket** to review the source folder, destination visibility, base commit and model before starting. If an Issue is needed, review the exact proposed Issue. If setup fails after publishing it, refresh the run details so the app can use the existing Issue. **Publish approved work** is also available for a batch of approved coding tickets.
- Codex runs in the prepared ticket worktree. Scope fixes, Stop and permission choices are in the ticket. The selected context and exact prompt are recorded locally. DeepSeek and compatible API coding drafts a patch for explicit tracked text files. Review the saved diff and choose **Apply this patch** or **Discard patch**.
- **Preview** opens the saved command from that ticket's worktree. For FocusFlow use `focusflow`, which opens a separate named review workspace. For a web project use an `npm run SCRIPT` entry that reports a loopback address. Use **Stop preview** to stop the tracked process. If the app cannot verify its identity, close the old preview manually.
- Review the actual diff and destination before publishing a PR. Refresh review evidence after the PR head, ticket requirements or project context changes. Ask for explanations or request a revision from the ticket. Merge explicitly on GitHub. FocusFlow marks the coding ticket Done after it observes the matching merge.

## Review workspaces and recovery

Run `.\Start-FocusFlow.cmd --review my-review` in the checkout to open a separate workspace. New names start empty. Reopen the same name and database format to keep your changes. The window displays **Separate workspace**. Run the launcher without arguments to open everyday data.

Existing everyday data is retained across checkouts. Review and development paths are documented in [Development](DEVELOPMENT.md#data-paths). Schema upgrades take a verified backup first. See [Backup and recovery](DEVELOPMENT.md#backup-and-recovery) if you need to recover a database.
