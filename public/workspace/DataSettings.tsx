import { t } from './locale.ts';
import { useEffect, useState } from 'react';
import { backupNow, chooseBackupFolder, clearBackupFolder, exportData, readCare } from '../../src/client/care.ts';
import type { CareStatus } from '../../src/shared/care.ts';

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
  const last = status?.lastBackup ? new Intl.DateTimeFormat(document.documentElement.lang, { dateStyle: 'medium', timeStyle: 'short' })
    .format(new Date(status.lastBackup)) : '';
  return <fieldset className="sound-settings care-settings" disabled={busy || !status}>
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
  </fieldset>;
}
