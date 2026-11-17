import { useEffect, useState } from 'react';
import { ModelPicker } from './ModelPicker.tsx';
import { defaultAiModelSelection } from '../../../src/shared/ai.ts';
import { projectSettings } from '../../../src/client/project-settings.ts';
import type { ProjectSettings } from '../../../src/shared/project-settings.ts';

export function ProjectSettingsPanel({ projectId }: { projectId: string }) {
  const [draft, setDraft] = useState<ProjectSettings>();
  const [status, setStatus] = useState('');
  const [model, setModel] = useState<'planning' | 'execution' | 'review'>();
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let current = true;
    void projectSettings(projectId).then(value => { if (current) setDraft(value); }, error => { if (current) setStatus(error.message); });
    return () => { current = false; };
  }, [projectId]);
  return <details className="project-settings" onToggle={event => { if (!event.currentTarget.open) setModel(undefined); }}><summary>Context and settings</summary>
    {draft && <form className="project-form" onSubmit={async event => {
      event.preventDefault(); setBusy(true); setStatus('');
      try { setDraft(await projectSettings(projectId, draft)); setStatus('Project settings saved.'); }
      catch (error) { setStatus(error instanceof Error ? error.message : 'Could not save project settings.'); }
      finally { setBusy(false); }
    }}>
      <label>Current requirements<textarea value={draft.requirements} maxLength={12000} onChange={event => setDraft({ ...draft, requirements: event.target.value })} /></label>
      <label>Decisions and constraints<textarea value={draft.decisions} maxLength={6000} onChange={event => setDraft({ ...draft, decisions: event.target.value })} /></label>
      <label>Relevant files and commands<textarea value={draft.references} maxLength={2000} onChange={event => setDraft({ ...draft, references: event.target.value })} /></label>
      <label>Local repository folder<input value={draft.sourcePath} maxLength={2000} onChange={event => setDraft({ ...draft, sourcePath: event.target.value })} /></label>
      <label>Preview command<input value={draft.preview} maxLength={100} placeholder="npm run dev or focusflow" onChange={event => setDraft({ ...draft, preview: event.target.value })} /></label>
      <label>Codex coding token budget<input type="number" min="0" max="1000000" value={draft.tokenBudget ?? 0}
        onChange={event => setDraft({ ...draft, tokenBudget: Number(event.target.value) })} /></label>
      <p>0 leaves the limit to the provider. FocusFlow stops a Codex coding run after reported usage reaches the budget.</p>
      {(['planning', 'execution', 'review'] as const).map(key => <button type="button" className="quiet-button" key={key}
        onClick={() => setModel(current => current === key ? undefined : key)}>Default {key} model</button>)}
      {model && <ModelPicker value={draft[model] ?? defaultAiModelSelection}
        onChange={selection => setDraft({ ...draft, [model]: selection })} />}
      <button className="primary" disabled={busy}>Save settings</button>
    </form>}
    {status && <p role="status">{status}</p>}
  </details>;
}
