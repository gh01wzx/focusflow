# FocusFlow

FocusFlow is a local Windows app for personal tasks, habits and project work. Use it without an account. Connect AI and GitHub when you want help planning a ticket, writing code or reviewing a pull request.

## Open FocusFlow

Use Node.js 24.12 or a later 24.x version. In the checkout, run:

~~~powershell
.\Start-FocusFlow.cmd
~~~

The launcher prepares the pinned desktop dependencies when needed. It opens your everyday profile in `%LOCALAPPDATA%\FocusFlow\desktop`. A new profile starts empty. If dependencies changed after a Git update, run `npm ci` once from the checkout.

Personal opens on **Today**. Add a one-off task or a repeating habit, track points and redeem your own rewards. In **Projects**, the Action center lists tickets to review, work in progress and the next eligible ticket. Open a project for its milestones and status board.

To try a change with separate data, run `.\Start-FocusFlow.cmd --review my-review`. A new review workspace starts empty. Opening the same name with the same database format retains its changes.

## Optional connections

Install the pinned Codex runtime with `npm run ai:install`, then connect it from **Settings > AI connection**. DeepSeek and compatible API connections are available in the same dialog. Link a repository through **GitHub connection** in the relevant project.

FocusFlow keeps its task database on this computer. A model call or a GitHub publication sends the material shown in its approval flow. Store connections in the app and keep credentials and personal data outside the checkout.

## More information

- [Using FocusFlow](docs/USAGE.md)
- [Development, data locations and recovery](docs/DEVELOPMENT.md)
- [Architecture](docs/ARCHITECTURE.md) and [product scope](docs/PRODUCT_BASELINE.md)
- [Windows acceptance](https://github.com/gh01wzx/focusflow/issues/68) and [AI and habits follow-up](https://github.com/gh01wzx/focusflow/issues/108)
