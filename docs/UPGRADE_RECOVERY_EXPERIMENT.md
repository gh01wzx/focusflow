# Manual upgrade and recovery experiment

Status: P0-03b technical validation. This tests two unsigned installer versions and database recovery, not an automatic updater or a signed release. Exact-head CI results and the JSON reports establish what passed.

## Version and schema boundary

The immutable baseline is commit `14a30b166ef350961518cff586fb2ffa5c22db50`, app version 0.0.1 with schema 1. The candidate is app version 0.0.2 with schema 2. The small schema-2 change adds format metadata; note data and UI behavior stay the same. No task-management feature is added.

Both versions use the same application ID, installation directory and profile convention. The desktop profile is outside installation output. Existing browser-spike data remains separate and uses the same migration infrastructure when opened by the candidate.

## Migration protection

The migration plan must be sequential. Databases newer than the supported schema are refused before journal settings or schema writes. Unknown nonempty schema-zero databases are also refused.

For an existing database, the candidate acquires SQLite's immediate writer reservation, rechecks the schema under that reservation, and uses a separate read-only connection to take a verified SQLite snapshot of committed data, including WAL content. The reservation prevents another writer changing the source between the snapshot and migration. A versioned JSON manifest records the snapshot name, source schema, target schema, creation time and SHA-256 checksum. A backup or manifest failure prevents migration.

Trusted compiled SQL steps, schema-version updates and an integrity check run within the transaction. Failure rolls back the transaction and preserves the pre-upgrade snapshot. Fresh databases use the same migration plan without a pre-upgrade snapshot. Reopening an already-current database does not repeat migration or create another migration backup.

Backups are stored below the database directory's `backups/` folder. Regular user-created test backups also get a checksum/schema manifest. No live `.db` file is copied without SQLite's backup API.

## Recovery boundary

Close all app instances first. Preserve the newer/failed database and any WAL/SHM sidecars together. Keep the backup `.db` and its matching `.db.json` manifest together, with their original names.

For this developer experiment, run:

```powershell
node scripts/restore-snapshot.ts BACKUP_DB NEW_DATABASE_PATH
```

The destination must be a new database path, with no existing WAL/SHM/journal sidecars. The helper verifies the manifest, checksum, SQLite integrity and schema, then exclusively creates the output. It refuses existing targets and never replaces the original database. Select a compatible app binary and point a disposable test profile at the restored data; the helper does not automatically change the active profile or reinstall software.

Restoring a pre-upgrade snapshot returns to that snapshot's point in time. Later edits stay in the preserved upgraded database and are not silently transferred to the older schema. Replacing a live database or running an older binary on newer data is not a recovery strategy.

This CLI is a development tool, not an end-user recovery UI. Production recovery instructions, active-profile switching, installer rollback and automatic recovery remain future work.

## Automated evidence

Database tests cover committed-WAL snapshots, idempotent reopen, partial migration rollback, backup failure preventing migration, checksum failures, existing-target/sidecar refusal, unknown databases and newer-schema refusal. Failure is injected with invalid SQL in disposable database tests; no failure-injection switch is shipped in the application.

The Windows `upgrade` job builds baseline installer A from its immutable commit, downloads candidate installer B from the same workflow, and runs both in a disposable runner directory. It saves text in installed A, installs B over A at the same path, verifies the text and schema upgrade, makes a later edit, and verifies the schema-1 snapshot still has the original text. It restores that snapshot into a separate profile and opens it with the packaged baseline A binary. The upgraded database must remain byte-identical during recovery.

The `windows-upgrade-experiment` artifact retains the baseline installer, screenshot and JSON upgrade report for 14 days. The `windows-desktop-experiment` artifact contains the candidate installer and separate desktop/audit diagnostics. Artifact presence alone is not a pass: inspect the workflow conclusion.

Remaining gates include owner-machine testing, signing, automatic update download/install feedback, interrupted installer behavior, power-loss recovery, binary rollback, quota-aware Codex integration and Phase 1 features. The known packaging dependency audit findings are unchanged.
