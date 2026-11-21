import { t } from './locale.ts';
import { useContext, useState } from 'react';
import type { InterfaceSettings } from '../../src/shared/interface.ts';
import { ProjectDialog } from '../projects/components/ProjectDialog.tsx';
import { InterfaceContext } from './interface-context.ts';
import { DataSettings } from './DataSettings.tsx';

export function SettingsPanel({ disabled }: { disabled: boolean }) {
  const context = useContext(InterfaceContext);
  const [draft, setDraft] = useState<InterfaceSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!context) return null;
  const { settings, save, readError, reload } = context;
  return <>
    <button id="workspace-settings" className="nav-item" disabled={disabled} onClick={() => {
      setDraft(settings); setError('');
    }}>{t("Settings")}</button>
    {draft && <ProjectDialog centered title={t("Settings")} locked={busy} returnFocusId="workspace-settings" onClose={() => setDraft(null)}>
      {readError ? <>
        <p role="alert">{t("Could not read settings.")}</p>
        <button disabled={busy} onClick={async () => {
          setBusy(true);
          try { setDraft(await reload()); setError(''); } catch { setError('Could not read settings.'); }
          finally { setBusy(false); }
        }}>{t("Retry")}</button>
      </> : <form className="project-form" onSubmit={async event => {
        event.preventDefault();
        setBusy(true); setError('');
        try { await save(draft); setDraft(null); }
        catch { setError('Could not save settings.'); } finally { setBusy(false); }
      }}>
        <label>{t("Language")}<select disabled={busy} value={draft.language} onChange={e =>
          setDraft({...draft, language: e.target.value === 'en' ? 'en' : 'zh-CN'})}>
          <option value="en">English</option><option value="zh-CN">{'\u7b80\u4f53\u4e2d\u6587'}</option>
        </select></label>
        <label>{t("Startup workspace")}<select disabled={busy} value={draft.start} onChange={e =>
          setDraft({...draft, start: e.target.value === 'projects' ? 'projects' : 'personal'})}>
          <option value="personal">{t("Personal")}</option><option value="projects">{t("Projects")}</option>
        </select></label>
        <label>{t("Interface size")}<select disabled={busy} value={draft.size} onChange={e =>
          setDraft({...draft, size: e.target.value === 'large' ? 'large' : 'standard'})}>
          <option value="standard">{t("Standard")}</option><option value="large">{t("Large")}</option>
        </select></label>
        <fieldset className="sound-settings" disabled={busy}>
          <legend>{t("Sound and motion")}</legend>
          <label><input type="checkbox" checked={draft.sound} onChange={e => setDraft({...draft, sound: e.target.checked})} />{t("Play sounds for points and timers")}</label>
          <label>{t("Volume")} <input type="range" min="0" max="1" step=".05" disabled={!draft.sound} value={draft.volume}
            onChange={e => setDraft({...draft, volume: Number(e.target.value)})} /></label>
          <label><input type="checkbox" checked={draft.reducedMotion} onChange={e => setDraft({...draft, reducedMotion: e.target.checked})} />{t("Reduce motion")}</label>
        </fieldset>
        <button className="primary" disabled={busy}>{t("Save settings")}</button>
      </form>}
      {error && <p role="alert">{t(error)}</p>}
      {!readError && <DataSettings />}
    </ProjectDialog>}
  </>;
}
