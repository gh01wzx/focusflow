# Windows installer and update decision

This is a validation proposal for #61, not a formal release approval. The app remains version 0.1.0-alpha.3. No account, signing purchase, release feed or public distribution was created.

## What to review now

Review the option comparison and the disposable experiment's run log. Check whether sample tasks, weekly schedules, ticket statuses and prerequisite links survive replacement and separate recovery. A local source review can use Review-FocusFlow.cmd task-61, which opens separate sample data; it does not perform an installer replacement.

No paid signing, account registration or distribution route is approved by this PR. Under the current no-paid-services requirement, keep unsigned builds for development review. Choosing a formal route and proving its trust/data behavior remain separate work.

## Recommended route

Keep the existing per-user, offline NSIS installer produced by pinned electron-builder 26.18.0. For a later in-app update story, evaluate its maintained electron-updater integration with a stable publisher identity, HTTPS distribution, signed binaries and tested backup/recovery. Do not build a custom updater.

The reproducible experiment below validates installer replacement and data preservation. It does not implement or approve one-click updates. Formal distribution is blocked until the owner chooses a viable signing/distribution route and its actual trusted update is demonstrated.

## Maintained routes

| Route | Windows and runtime | Trust and distribution | Data and recovery | Assessment |
| --- | --- | --- | --- | --- |
| Existing NSIS + electron-updater | Bundles Electron/Node; no separately installed Node/npm required for users. Full NSIS payload can install offline; update checks/downloads need network | Publisher signing and a maintained HTTPS feed are required for the proposed formal route. v26 supports Windows signature validation | Keep external profile; snapshot before schema migration; recovery uses a separate target. Reinstalling old code is safe only with a compatible schema | Smallest change to the current project; recommended |
| Squirrel.Windows + Electron built-in autoUpdater | Maintained Electron API, different packaging/feed arrangement; Windows first-run locks need handling | Uses a different updater path; electron-updater's NSIS path does not support Squirrel.Windows | Would need equivalent upgrade/data/recovery tests after changing packaging | Adds migration work with no current user benefit |
| MSIX + App Installer or Microsoft Store | Windows package identity and package/update distribution managed by Windows/Store; requires packaging adaptation | Signed/trusted package or Store certification; account onboarding and distribution-policy review | Package identity can change data locations. Existing external data and uninstall behavior require a migration decision and tests | Concrete alternative if independent signing is disproportionate |

Use [stable v26 auto-update documentation](https://www.electron.build/v26/docs/features/auto-update/) and [v26 Windows signing options](https://www.electron.build/v26/docs/win/). The unversioned builder documentation describes v27 behavior too; its future/default manifest rules are not evidence about this pinned v26 build.

## Cost and eligibility snapshot

Checked against provider pages on 2026-11-07. These are published starting points, not quotes, purchasing advice or evidence that the owner qualifies. Confirm taxes, currency, identity requirements, key storage and current availability before any purchase.

| Option | Published cost | Known constraint | Decision still needed |
| --- | --- | --- | --- |
| Unsigned NSIS development builds | No signing purchase | Unknown-publisher/SmartScreen warnings; no demonstrated trusted update chain | Suitable for explicit development review only |
| Azure Artifact Signing | Basic USD 9.99/month for 5,000 signatures; USD 0.005 each above quota | Current service quickstart limits Public Trust individuals to USA/Canada. New Zealand organizations are listed separately; personal location does not establish eligibility | Not a proven option for a New Zealand individual; do not assume organization eligibility |
| Certum Open Source code offer | Listed from EUR 25 for certificate activation code | Official page currently says out of stock and requires an existing cryptoCertum card/reader. Not an all-in hardware/CI price or confirmed issuance | Obtain current availability and total cost if the owner chooses direct signing |
| Microsoft Store | Current onboarding documentation says individual/company registration is free through the new flow | New account/identity validation, certification and MSIX packaging needed. Registration cost alone does not prove app acceptance or data/update behavior | Alternative requiring explicit owner choice and a separate validation task |

[Azure published pricing](https://azure.microsoft.com/en-gb/products/artifact-signing), [service eligibility](https://learn.microsoft.com/en-us/azure/artifact-signing/quickstart), [Certum exact offer and hardware requirements](https://shop.certum.eu/open-source-code-signing-code.html), [Store registration](https://learn.microsoft.com/en-us/windows/apps/publish/faq/open-developer-account).

A signature does not promise immediate SmartScreen acceptance. The release trial must verify the chosen identity, signature handling and download/update chain on supported Windows machines.

## Reproduce the disposable experiment

Open the **Windows installer replacement experiment** Actions workflow for this PR. Relevant packaging, schema, profile and harness changes run it for PRs targeting main and pushes to main. Documentation-only PRs skip this native experiment. It can also be run with workflow_dispatch after the workflow exists on the default branch. It uses only a public repository and a standard GitHub-hosted Windows runner, cancels superseded runs and uploads no artifacts or caches. The script refuses non-Actions and self-hosted environments because installers modify per-user registration and shortcuts. Use an ephemeral hosted runner rather than a personal machine; do not bypass the guard for a local review.

1. Build the existing unsigned 0.1.0-alpha.3 full installer.
2. Build the same code/schema as a test-only 0.1.0-alpha.4 installer, without changing package.json or publishing anything.
3. Install the baseline in an owned temporary directory, keeping an allowlisted hosted Windows shell environment for the installer. Launch its ordinary packaged desktop executable with separate synthetic APPDATA/LOCALAPPDATA paths and an isolated test profile. Do not point the installer itself at the synthetic app profile; NSIS uses Windows shell/PowerShell helpers.
4. Save Personal tasks, a selected-weekday repeat and a project/milestone with two manual tickets, Done/Backlog statuses and a prerequisite link. Create a verified product snapshot.
5. Close the owned process, replace its binaries with the candidate installer and assert that the installer leaves database bytes unchanged.
6. Launch the candidate and compare exact task/repeat/project records, including identities, statuses and the prerequisite link. Restore the snapshot to a separate target and verify its contents while leaving the current database unchanged.
7. Reinstall the baseline and verify the same records again. This last step tests same-schema binary rollback only.
8. Print stages, installer SHA-256 values, versions, schema, the exact commit and process reports in the Actions run log. Screenshots/reports remain local to the disposable runner or an explicit developer run; they are not uploaded. Installer waits observe the owned parent exit with no captured output pipes. Each install records its PID, elapsed time, exit result and whether the installed files exist, even when the experiment fails. On launch/close failure, stop and record the stage; do not automatically retry.

The harness is scripts/smoke-install-update.ts; the job is .github/workflows/install-update.yml. Results belong in the PR, not a permanent success claim here. The experiment uses the same code/schema for both versions; existing product-recovery checks separately exercise prior-schema migration and backup restoration.

## What remains before formal updates

- Owner chooses direct signed NSIS distribution or the Store alternative, including actual eligibility and total cost.
- Demonstrate a genuine signed old-to-new build over the selected HTTPS feed, explicit user consent, interrupted download/install handling and publisher mismatch rejection.
- Prove data preservation across an actual schema upgrade and recovery with a compatible app version. Never open a newer database with old code or overwrite live data during recovery.
- Record exact build identity, installed-user behavior without developer tooling, and remaining SmartScreen/policy restrictions.

No current PR silently buys signing, registers an account, creates a public release or changes the approved MVP update requirement.
