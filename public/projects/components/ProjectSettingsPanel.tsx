import { useEffect, useState } from 'react';
import { ModelPicker } from './ModelPicker.tsx';
import { defaultAiModelSelection } from '../../../src/shared/ai.ts';
import { projectSettings, repositoryContext } from '../../../src/client/project-settings.ts';
import type { ProjectSettings, RepositoryContext } from '../../../src/shared/project-settings.ts';

export function ProjectSettingsPanel({ projectId }: { projectId: string }) {
  const [draft, setDraft] = useState<ProjectSettings>();
  const [status, setStatus] = useState('');
  const [model, setModel] = useState<'planning' | 'execution' | 'review'>();
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const [sources, setSources] = useState<RepositoryContext>();
  const [savedFolder, setSavedFolder] = useState('');
  const [selectedSource, setSelectedSource] = useState('');
  const [excerpt, setExcerpt] = useState('');
  const source = sources?.files.find(file => file.path === selectedSource);
  useEffect(() => {
    let current = true;
    void projectSettings(projectId).then(value => { if (current) { setDraft(value); setSavedFolder(value.sourcePath); } }, error => { if (current) setStatus(error.message); });
    return () => { current = false; };
  }, [projectId]);
  return <details className="project-settings" onToggle={event => { if (!event.currentTarget.open) setModel(undefined); }}><summary>Context and settings</summary>
    {draft && <form className="project-form" onSubmit={async event => {
      event.preventDefault(); setBusy(true); setStatus('');
      try {
        const saved = await projectSettings(projectId, draft);
        setDraft(saved); setSavedFolder(saved.sourcePath); setSources(undefined); setStatus('Project settings saved.');
      }
      catch (error) { setStatus(error instanceof Error ? error.message : 'Could not save project settings.'); }
      finally { setBusy(false); }
    }}>
      <label>Current requirements<textarea value={draft.requirements} maxLength={12000} onChange={event => setDraft({ ...draft, requirements: event.target.value })} /></label>
      <label>Decisions and constraints<textarea value={draft.decisions} maxLength={6000} onChange={event => setDraft({ ...draft, decisions: event.target.value })} /></label>
      <label>Relevant files and commands<textarea value={draft.references} maxLength={2000} onChange={event => setDraft({ ...draft, references: event.target.value })} /></label>
      <label>Local repository folder<input value={draft.sourcePath} maxLength={2000} onChange={event => setDraft({ ...draft, sourcePath: event.target.value })} /></label>
      <button type="button" className="quiet-button" disabled={busy || importing || !savedFolder || draft.sourcePath !== savedFolder}
        onClick={async () => {
          setImporting(true); setStatus(''); setSources(undefined); setSelectedSource(''); setExcerpt('');
          try {
            const result = await repositoryContext(projectId);
            setSources(result);
            if (!result.files.length) setStatus('No supported project documents were found in the saved repository revision.');
          } catch (error) { setStatus(error instanceof Error ? error.message : 'Could not read repository references.'); }
          finally { setImporting(false); }
        }}>Read repository references</button>
      {!!sources?.files.length && draft.sourcePath === savedFolder && <>
        <label>Repository document at {sources.revision.slice(0, 12)}<select value={selectedSource} onChange={event => {
          const path = event.target.value;
          setSelectedSource(path);
          setExcerpt(sources.files.find(file => file.path === path)?.excerpt ?? '');
        }}>
          <option value="">Choose a document</option>
          {sources.files.map(file => <option key={file.path} value={file.path}>{file.path}</option>)}
        </select></label>
        {source && <>
          <label>{source.truncated ? 'Edit this excerpt before adding it' : 'Edit this text before adding it'}
            <textarea value={excerpt} maxLength={1500} onChange={event => setExcerpt(event.target.value)} /></label>
          <button type="button" className="quiet-button" disabled={busy || !excerpt.trim()} onClick={() => {
            const reference = source.path + ' @ ' + sources.revision.slice(0, 12) + '\n' + excerpt.trim();
            const next = [draft.references, reference].filter(Boolean).join('\n\n');
            if (next.length > 2000) { setStatus('Shorten the excerpt or existing references to fit 2,000 characters.'); return; }
            setDraft({ ...draft, references: next }); setSelectedSource(''); setExcerpt('');
            setStatus('Reference added to the draft. Save settings to keep it.');
          }}>Add to references</button>
        </>}
      </>}
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
