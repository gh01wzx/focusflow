import { t } from './locale.ts';
import { useEffect, useState } from 'react';
import { backupNow, chooseBackupFolder, chooseDataFolder, clearBackupFolder, defaultDataFolder, exportData, moveData, readCare, saveStartup } from '../../src/client/care.ts';
import type { CareStatus, DataMove, DataMoveMode } from '../../src/shared/care.ts';

const when = (iso: string) => new Intl.DateTimeFormat(document.documentElement.lang, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));

// Where the task database lives. A chosen folder is confirmed before anything is copied, and the
// app restarts to use it. The previous folder keeps its copy.
function DataLocation({ status, busy, onBusy }: { status: CareStatus; busy: boolean; onBusy(busy: boolean): void }) {
  const [move, setMove] = useState<DataMove | null>(null);
  const [error, setError] = useState('');
  const [restarting, setRestarting] = useState(false);
  async function plan(work: () => Promise<DataMove | null>) {
    onBusy(true); setError('');
    try { setMove(await work()); } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not use this folder.'); }
    finally { onBusy(false); }
  }
  async function apply(mode: DataMoveMode) {
    if (!move) return;
    onBusy(true); setError('');
    try { await moveData(move, mode); setRestarting(true); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not move the data.'); onBusy(false); }
  }
  return <fieldset className="sound-settings care-settings" disabled={busy || restarting}>
    <legend>{t("Data folder")}</legend>
    <p className="group-note">{t(status.defaultData ? "Your tasks, habits and settings are saved in the default folder:" : "Your tasks, habits and settings are saved in:")}</p>
    <p className="care-path">{status.dataDirectory}</p>
    {restarting ? <p role="status" className="care-message">{t("Restarting FocusFlow with the new folder...")}</p>
      : move ? <div className="care-confirm" role="group" aria-label={t("Use this folder")}>
        <p className="care-path">{move.directory}</p>
        <p>{move.existing ? t("This folder already has FocusFlow data, last changed {0}.", when(move.existing))
          : t("FocusFlow copies your data here with a verified backup, then restarts. The current folder keeps its copy.")}</p>
        {move.existing && <p className="group-note">{t("Replacing keeps the data that was there as a backup file in its backups folder.")}</p>}
        <div className="care-actions">
          {move.existing ? <>
            <button type="button" className="primary" onClick={() => void apply('switch')}>{t("Use the data there")}</button>
            <button type="button" className="secondary-button" onClick={() => void apply('replace')}>{t("Replace it with my current data")}</button>
          </> : <button type="button" className="primary" onClick={() => void apply('copy')}>{t("Copy and restart")}</button>}
          <button type="button" className="text-button" onClick={() => setMove(null)}>{t("Cancel")}</button>
        </div>
      </div>
      : <div className="care-actions">
        <button type="button" className="secondary-button" onClick={() => void plan(chooseDataFolder)}>{t("Choose another folder")}</button>
        {!status.defaultData && <button type="button" className="text-button" onClick={() => void plan(defaultDataFolder)}>{t("Use the default folder")}</button>}
      </div>}
    <p className="group-note">{t("Use a folder on this computer or a drive that stays connected. For a cloud drive such as OneDrive, choose it as the backup folder instead: syncing an open database can damage it.")}</p>
    {error && <p role="alert">{t(error)}</p>}
  </fieldset>;
}

// Backups and export take effect at once, apart from the settings saved with the form above.
export function DataSettings() {
  const [status, setStatus] = useState<CareStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    void readCare().then(value => { if (active) setStatus(value); }).catch(() => { if (active) setError('Could not read backup settings.'); });
    return () => { active = false; };
  }, []);
  async function run(work: () => Promise<CareStatus>, done = '') {
    setBusy(true); setError(''); setMessage('');
    try { setStatus(await work()); setMessage(done); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not finish this action.'); }
    finally { setBusy(false); }
  }
  async function runExport(format: 'json' | 'csv') {
    setBusy(true); setError(''); setMessage('');
    try { const files = await exportData(format); setMessage(t('Exported to {0}', files.join(', '))); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not export.'); }
    finally { setBusy(false); }
  }
  const last = status?.lastBackup ? when(status.lastBackup) : '';
  return <><fieldset className="sound-settings care-settings" disabled={busy || !status}>
    <legend>{t("Start and reminders")}</legend>
    {status && status.loginItem !== null && <label><input type="checkbox" checked={!!status?.loginItem}
      onChange={event => void run(() => saveStartup({ loginItem: event.target.checked }))} />{t("Start FocusFlow in the tray when I sign in to Windows")}</label>}
    <label><input type="checkbox" checked={!!status?.reminders}
      onChange={event => void run(() => saveStartup({ reminders: event.target.checked }))} />{t("Remind me of habits at their planned time")}</label>
    <p className="group-note">{t("A reminder comes at a habit's planned time until it is checked in, and at 8 PM for habits still open. Paused habits stay quiet.")}</p>
  </fieldset>
  <fieldset className="sound-settings care-settings" disabled={busy || !status}>
    <legend>{t("Backups and export")}</legend>
    <p className="group-note">{t("FocusFlow keeps a daily backup of the last 30 days beside your data.")}{' '}
      {last ? t("Last backup: {0}.", last) : t("The first backup is made a few seconds after opening.")}</p>
    <div className="care-actions">
      <button type="button" className="secondary-button" onClick={() => void run(backupNow, t('Backup saved.'))}>{t("Back up now")}</button>
    </div>
    <p className="group-note">{status?.folder ? t("Each backup is also copied to {0}.", status.folder)
      : t("Choose a folder that a cloud drive syncs, such as OneDrive, to keep a copy off this computer.")}</p>
    {status?.canChooseFolder && <div className="care-actions">
      <button type="button" className="secondary-button" onClick={() => void run(chooseBackupFolder)}>
        {t(status.folder ? "Change backup folder" : "Choose backup folder")}</button>
      {status.folder && <button type="button" className="text-button" onClick={() => void run(clearBackupFolder)}>{t("Stop copying")}</button>}
    </div>}
    {status?.folderError && <p role="alert">{t(status.folderError)}</p>}
    <p className="group-note">{t("Export everything as JSON, or tasks and points as CSV tables for a spreadsheet.")}</p>
    <div className="care-actions">
      <button type="button" className="secondary-button" onClick={() => void runExport('json')}>{t("Export JSON")}</button>
      <button type="button" className="secondary-button" onClick={() => void runExport('csv')}>{t("Export CSV")}</button>
    </div>
    {message && <p role="status" className="care-message">{message}</p>}
    {error && <p role="alert">{t(error)}</p>}
  </fieldset>
  {status?.canMoveData && <DataLocation status={status} busy={busy} onBusy={setBusy} />}</>;
}
