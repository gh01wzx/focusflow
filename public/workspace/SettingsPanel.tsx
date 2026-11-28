import { t } from './locale.ts';
import { useContext, useEffect, useRef, useState } from 'react';
import type { InterfaceSettings } from '../../src/shared/interface.ts';
import { ProjectDialog } from '../projects/components/ProjectDialog.tsx';
import { InterfaceContext } from './interface-context.ts';
import { DataSettings, ReminderSettings, useCare } from './DataSettings.tsx';

type Section = 'general' | 'reminders' | 'data';
const sections: { key: Section; label: string }[] = [
  { key: 'general', label: 'General' }, { key: 'reminders', label: 'Start and reminders' }, { key: 'data', label: 'Data' },
];

// Every setting takes effect as it changes, so there is no save button. The volume waits until the
// slider rests, so dragging it does not send a save for every step.
function GeneralSettings({ settings, save }: { settings: InterfaceSettings; save(value: InterfaceSettings): Promise<void> }) {
  const [draft, setDraft] = useState(settings);
  const [error, setError] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const pending = useRef<InterfaceSettings | null>(null);
  function flush() {
    clearTimeout(timer.current);
    const next = pending.current;
    pending.current = null;
    if (next) save(next).then(() => setError(''), () => setError('Could not save settings.'));
  }
  // Closing Settings while the volume waits still saves it.
  useEffect(() => flush, []);
  function update(change: Partial<InterfaceSettings>, delay = 0) {
    const next = { ...draft, ...change };
    setDraft(next);
    pending.current = next;
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, delay);
  }
  return <>
    <section className="settings-section" aria-labelledby="settings-display">
      <h3 id="settings-display">{t("Language and display")}</h3>
      <div className="field-stack"><label htmlFor="settings-language">{t("Language")}</label><select id="settings-language" value={draft.language} onChange={event => update({ language: event.target.value === 'en' ? 'en' : 'zh-CN' })}>
        <option value="en">English</option><option value="zh-CN">{'\u7b80\u4f53\u4e2d\u6587'}</option>
      </select></div>
      <div className="field-stack"><label htmlFor="settings-start">{t("Startup workspace")}</label><select id="settings-start" value={draft.start} onChange={event => update({ start: event.target.value === 'projects' ? 'projects' : 'personal' })}>
        <option value="personal">{t("Personal")}</option><option value="projects">{t("Projects")}</option>
      </select></div>
      <div className="field-stack"><label htmlFor="settings-size">{t("Interface size")}</label><select id="settings-size" value={draft.size} onChange={event => update({ size: event.target.value === 'large' ? 'large' : 'standard' })}>
        <option value="standard">{t("Standard")}</option><option value="large">{t("Large")}</option>
      </select></div>
    </section>
    <section className="settings-section" aria-labelledby="settings-sound">
      <h3 id="settings-sound">{t("Sound and motion")}</h3>
      <label className="toggle-row"><input type="checkbox" checked={draft.sound} onChange={event => update({ sound: event.target.checked })} />{t("Play sounds for points and timers")}</label>
      <label className="range">{t("Volume")} <input type="range" min="0" max="1" step=".05" disabled={!draft.sound} value={draft.volume}
        onChange={event => update({ volume: Number(event.target.value) }, 400)} /></label>
      <label className="toggle-row"><input type="checkbox" checked={draft.reducedMotion} onChange={event => update({ reducedMotion: event.target.checked })} />{t("Reduce motion")}</label>
    </section>
    <p className="settings-saved">{t("Changes are saved as you make them.")}</p>
    {error && <p role="alert">{t(error)}</p>}
  </>;
}

function SettingsBody() {
  const context = useContext(InterfaceContext)!;
  const [section, setSection] = useState<Section>('general');
  const [retrying, setRetrying] = useState(false);
  const care = useCare();
  if (context.readError) return <div className="settings-pane">
    <p role="alert">{t("Could not read settings.")}</p>
    <button type="button" className="secondary-button" disabled={retrying} onClick={async () => {
      setRetrying(true);
      try { await context.reload(); } catch { /* The message stays. */ } finally { setRetrying(false); }
    }}>{t("Retry")}</button>
  </div>;
  return <div className="settings-layout">
    <div className="settings-tabs" role="tablist" aria-label={t("Settings sections")} aria-orientation="vertical">
      {sections.map(item => <button key={item.key} type="button" role="tab" id={'settings-tab-' + item.key}
        aria-selected={section === item.key} aria-controls="settings-pane" tabIndex={section === item.key ? 0 : -1}
        onClick={() => setSection(item.key)} onKeyDown={event => {
          const index = sections.findIndex(entry => entry.key === section);
          const step = event.key === 'ArrowDown' || event.key === 'ArrowRight' ? 1 : event.key === 'ArrowUp' || event.key === 'ArrowLeft' ? -1 : 0;
          if (!step) return;
          event.preventDefault();
          const next = sections[(index + step + sections.length) % sections.length]!;
          setSection(next.key);
          document.getElementById('settings-tab-' + next.key)?.focus();
        }}>{t(item.label)}</button>)}
    </div>
    <div className="settings-pane" id="settings-pane" role="tabpanel" aria-labelledby={'settings-tab-' + section}>
      {section === 'general' ? <GeneralSettings settings={context.settings} save={context.save} />
        : section === 'reminders' ? <ReminderSettings care={care} /> : <DataSettings care={care} />}
    </div>
  </div>;
}

export function SettingsPanel({ disabled }: { disabled: boolean }) {
  const context = useContext(InterfaceContext);
  const [open, setOpen] = useState(false);
  if (!context) return null;
  return <>
    <button id="workspace-settings" className="nav-item" disabled={disabled} onClick={() => setOpen(true)}>{t("Settings")}</button>
    {open && <ProjectDialog centered title={t("Settings")} locked={false} returnFocusId="workspace-settings" onClose={() => setOpen(false)}>
      <SettingsBody />
    </ProjectDialog>}
  </>;
}
