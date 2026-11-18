# FocusFlow

FocusFlow is a local Windows and macOS app for personal tasks, habits and project work. Use it without an account. Connect AI and GitHub when you want help planning a ticket, writing code or reviewing a pull request.

## Open FocusFlow

Install Git and Node.js 24.12 or a later 24.x version with npm. On Windows, double-click `Start-FocusFlow.cmd` or run this from the checkout.

~~~powershell
.\Start-FocusFlow.cmd
~~~

On a MacBook, use macOS 13.5 or later and the Node.js build for your Mac (Apple silicon or Intel). In Terminal:

~~~sh
git clone https://github.com/gh01wzx/focusflow.git
cd focusflow
./Start-FocusFlow.command
~~~

After cloning, you can also double-click `Start-FocusFlow.command` in Finder. The first launch downloads the pinned dependencies and builds the app. The Mac launcher refreshes dependencies when the lockfile changes. On Windows, run `npm ci` if dependencies change after a Git update.

Closing the window keeps FocusFlow running in the Windows notification area or the Mac menu bar. Click the tray icon, or open the launcher again, to bring the window back. To end FocusFlow, choose **Quit FocusFlow** from the tray icon's menu, or press Cmd+Q on a Mac. The launcher window closes once the app opens. Review workspaces opened with `--review` keep their launcher window open.

Everyday data stays outside the checkout, in `~/Library/Application Support/FocusFlow/desktop` on Mac and `%LOCALAPPDATA%\FocusFlow\desktop` on Windows. New profiles start empty.

Personal opens on **Today**. Add a one-off task or a repeating habit, track points and redeem your own rewards. In **Projects**, the Action center lists tickets to review, work in progress and the next eligible ticket. Open a project for its milestones and status board.

To try a change with separate data, run `./Start-FocusFlow.command --review my-review` on Mac or `.\Start-FocusFlow.cmd --review my-review` on Windows. A new review workspace starts empty. Opening the same name with the same database format retains its changes.

## Optional connections

Open **AI connection** above **Settings** to connect an OpenAI, Claude, DeepSeek or compatible API. Codex also supports ChatGPT sign-in after `npm run ai:install`. In **Settings**, choose English or Simplified Chinese, the startup workspace and the interface size. Link a repository through **GitHub connection** in the relevant project.

FocusFlow keeps its task database on this computer. A model call or a GitHub publication sends the material shown in its approval flow. Store connections in the app and keep credentials and personal data outside the checkout.

## More information

- [Using FocusFlow](docs/USAGE.md)
- [Development, data locations and recovery](docs/DEVELOPMENT.md)
- [Architecture](docs/ARCHITECTURE.md) and [product scope](docs/PRODUCT_BASELINE.md)
- [Windows acceptance](https://github.com/gh01wzx/focusflow/issues/68) and [AI and habits follow-up](https://github.com/gh01wzx/focusflow/issues/108)
