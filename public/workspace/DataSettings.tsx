import { t } from './locale.ts';
import { useEffect, useState } from 'react';
import { backupNow, chooseBackupFolder, chooseDataFolder, chooseImport, clearBackupFolder, defaultDataFolder, exportData, importData,
  moveData, readCare, revealData, saveCarePreferences } from '../../src/client/care.ts';
import type { CareStatus, DataImport, DataMove, DataMoveMode } from '../../src/shared/care.ts';

const when = (iso: string) => new Intl.DateTimeFormat(document.documentElement.lang, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
const failed = (failure: unknown, fallback: string) => failure instanceof Error ? failure.message : fallback;

// Backups, export, reminders and the data file all take effect at once. Settings reads them once
// and shares them between its sections.
export function useCare() {
  const [status, setStatus] = useState<CareStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    void readCare().then(value => { if (active) setStatus(value); }).catch(() => { if (active) setError('Could not read backup settings.'); });
    return () => { active = false; };
  }, []);
  async function run<T>(work: () => Promise<T>, done?: (value: T) => string): Promise<T | undefined> {
    setBusy(true); setError(''); setMessage('');
    try {
      const value = await work();
      if (value && typeof value === 'object' && 'dataFile' in value) setStatus(value as unknown as CareStatus);
      if (done) setMessage(done(value));
      return value;
    } catch (failure) { setError(failed(failure, 'Could not finish this action.')); return undefined; }
    finally { setBusy(false); }
  }
  return { status, busy, message, error, run, setBusy, setError };
}
export type Care = ReturnType<typeof useCare>;

function Feedback({ care }: { care: Care }) {
  return <>
    {care.message && <p role="status" className="care-message">{care.message}</p>}
    {care.error && <p role="alert">{t(care.error)}</p>}
  </>;
}

export function ReminderSettings({ care }: { care: Care }) {
  const { status } = care;
  return <>
    <section className="settings-section" aria-labelledby="settings-start">
      <h3 id="settings-start">{t("Start and reminders")}</h3>
      {status && status.loginItem !== null && <label className="toggle-row"><input type="checkbox" checked={!!status.loginItem} disabled={care.busy}
        onChange={event => void care.run(() => saveCarePreferences({ loginItem: event.target.checked }))} />{t("Start FocusFlow in the tray when I sign in to Windows")}</label>}
      <label className="toggle-row"><input type="checkbox" checked={!!status?.reminders} disabled={care.busy || !status}
        onChange={event => void care.run(() => saveCarePreferences({ reminders: event.target.checked }))} />{t("Remind me of habits at their planned time")}</label>
      <p className="group-note">{t("A reminder comes at a habit's planned time until it is checked in, and at 8 PM for habits still open. Paused habits stay quiet.")}</p>
    </section>
    <Feedback care={care} />
  </>;
}

// The data file: where it is, moving it to another folder, and importing another data file. Each
// change is confirmed first, then the app restarts; nothing is deleted.
function DataFile({ care, status }: { care: Care; status: CareStatus }) {
  const [move, setMove] = useState<DataMove | null>(null);
  const [incoming, setIncoming] = useState<DataImport | null>(null);
  const [restarting, setRestarting] = useState(false);
  async function apply(work: () => Promise<void>) {
    care.setBusy(true); care.setError('');
    try { await work(); setRestarting(true); }
    catch (failure) { care.setError(failed(failure, 'Could not finish this action.')); care.setBusy(false); }
  }
  const choosing = !!move || !!incoming;
  return <section className="settings-section" aria-labelledby="settings-data-file">
    <h3 id="settings-data-file">{t("Data file")}</h3>
    <p className="group-note">{t(status.defaultData ? "Your tasks, habits and settings are one file in the default folder:" : "Your tasks, habits and settings are one file in:")}</p>
    <p className="care-path">{status.dataFile}</p>
    {restarting ? <p role="status" className="care-message">{t("Restarting FocusFlow...")}</p>
      : move ? <div className="care-confirm" role="group" aria-label={t("Use this folder")}>
        <p className="care-path">{move.directory}</p>
        <p>{move.existing ? t("This folder already has FocusFlow data, last changed {0}.", when(move.existing))
          : t("FocusFlow copies your data here with a verified backup, then restarts. The current folder keeps its copy.")}</p>
        {move.existing && <p className="group-note">{t("Replacing keeps the data that was there as a backup file in its backups folder.")}</p>}
        <div className="care-actions">
          {move.existing ? <>
            <button type="button" className="primary" disabled={care.busy} onClick={() => void apply(() => moveData(move, 'switch' satisfies DataMoveMode))}>{t("Use the data there")}</button>
            <button type="button" className="secondary-button" disabled={care.busy} onClick={() => void apply(() => moveData(move, 'replace'))}>{t("Replace it with my current data")}</button>
          </> : <button type="button" className="primary" disabled={care.busy} onClick={() => void apply(() => moveData(move, 'copy'))}>{t("Copy and restart")}</button>}
          <button type="button" className="text-button" disabled={care.busy} onClick={() => setMove(null)}>{t("Cancel")}</button>
        </div>
      </div>
      : incoming ? <div className="care-confirm" role="group" aria-label={t("Import this file")}>
        <p className="care-path">{incoming.file}</p>
        <p>{t("Replace your current data with this file, last changed {0}? Your current data is kept in the backups folder, then FocusFlow restarts.", when(incoming.changedAt))}</p>
        <div className="care-actions">
          <button type="button" className="primary" disabled={care.busy} onClick={() => void apply(() => importData(incoming))}>{t("Import and restart")}</button>
          <button type="button" className="text-button" disabled={care.busy} onClick={() => setIncoming(null)}>{t("Cancel")}</button>
        </div>
      </div>
      : <div className="care-actions">
        {status.canReveal && <button type="button" className="secondary-button" disabled={care.busy} onClick={() => void care.run(revealData)}>{t("Open the folder")}</button>}
        {status.canMoveData && <button type="button" className="secondary-button" disabled={care.busy}
          onClick={() => void care.run(chooseDataFolder).then(value => { if (value) setMove(value); })}>{t("Move to another folder")}</button>}
        {status.canImport && <button type="button" className="secondary-button" disabled={care.busy}
          onClick={() => void care.run(chooseImport).then(value => { if (value) setIncoming(value); })}>{t("Import a data file")}</button>}
        {status.canMoveData && !status.defaultData && <button type="button" className="text-button" disabled={care.busy}
          onClick={() => void care.run(defaultDataFolder).then(value => { if (value) setMove(value); })}>{t("Use the default folder")}</button>}
      </div>}
    {!choosing && !restarting && <p className="group-note">{t("Keep the data file on this computer or a drive that stays connected. For a cloud drive such as OneDrive, choose it as the backup folder instead: syncing a file in use can damage it.")}</p>}
  </section>;
}

export function DataSettings({ care }: { care: Care }) {
  const { status } = care;
  const exported = (files: string[]) => files.length ? t('Exported to {0}', files.join(', ')) : '';
  if (!status) return <Feedback care={care} />;
  return <>
    <DataFile care={care} status={status} />
    <section className="settings-section" aria-labelledby="settings-backups">
      <h3 id="settings-backups">{t("Backups")}</h3>
      <div className="field-stack"><label htmlFor="settings-backup-mode">{t("Back up")}</label><select id="settings-backup-mode" value={status.backupMode} disabled={care.busy}
        onChange={event => void care.run(() => saveCarePreferences({ backupMode: event.target.value === 'quit' ? 'quit' : 'daily' }))}>
        <option value="daily">{t("Once a day")}</option><option value="quit">{t("Each time FocusFlow quits")}</option>
      </select></div>
      <p className="group-note">{t("FocusFlow keeps the last 30 backups beside your data.")}{' '}
        {status.lastBackup ? t("Last backup: {0}.", when(status.lastBackup)) : t("No backup yet.")}</p>
      <div className="care-actions">
        <button type="button" className="secondary-button" disabled={care.busy} onClick={() => void care.run(backupNow, () => t('Backup saved.'))}>{t("Back up now")}</button>
      </div>
      <p className="group-note">{status.folder ? t("Each backup is also copied to {0}.", status.folder)
        : t("Choose a folder that a cloud drive syncs, such as OneDrive, to keep a copy off this computer.")}</p>
      {status.canChooseFolder && <div className="care-actions">
        <button type="button" className="secondary-button" disabled={care.busy} onClick={() => void care.run(chooseBackupFolder)}>
          {t(status.folder ? "Change backup folder" : "Choose backup folder")}</button>
        {status.folder && <button type="button" className="text-button" disabled={care.busy} onClick={() => void care.run(clearBackupFolder)}>{t("Stop copying")}</button>}
      </div>}
      {status.folderError && <p role="alert">{t(status.folderError)}</p>}
    </section>
    <section className="settings-section" aria-labelledby="settings-export">
      <h3 id="settings-export">{t("Export")}</h3>
      <p className="group-note">{t("A data file is one complete copy you can import again. JSON has everything as text; CSV has tasks and points as tables for a spreadsheet.")}</p>
      <div className="care-actions">
        <button type="button" className="secondary-button" disabled={care.busy} onClick={() => void care.run(() => exportData('file'), exported)}>{t("Export a data file")}</button>
        <button type="button" className="secondary-button" disabled={care.busy} onClick={() => void care.run(() => exportData('json'), exported)}>{t("Export JSON")}</button>
        <button type="button" className="secondary-button" disabled={care.busy} onClick={() => void care.run(() => exportData('csv'), exported)}>{t("Export CSV")}</button>
      </div>
    </section>
    <Feedback care={care} />
  </>;
}
