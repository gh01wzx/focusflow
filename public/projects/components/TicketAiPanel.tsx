import { t } from '../../workspace/locale.ts';
import { useEffect, useState } from 'react';
import { defaultAiModelSelection } from '../../../src/shared/ai.ts';
import type { AiModelSelection } from '../../../src/shared/ai.ts';
import type { SuggestedTicket } from '../../../src/shared/plans.ts';
import type { ProjectTicket } from '../../../src/shared/projects.ts';
import { projectSettings } from '../../../src/client/project-settings.ts';
import { aiProviderNames } from '../../../src/shared/ai.ts';
import { ModelPicker } from './ModelPicker.tsx';

interface State { busy: boolean; draft: null | { id: string; selection: AiModelSelection; suggestions: SuggestedTicket[]; children: string[]; result: string; requirements?: { id: string; text: string }[] } }
async function request(id: string, action = '', data?: unknown): Promise<State> {
  const response = await fetch('/api/project-tickets/' + id + '/ai' + (action ? '/' + action : ''), action ? {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data ?? {}),
  } : {});
  const result = await response.json() as State & { error?: string };
  if (!response.ok) throw new Error(result.error ?? 'Could not use AI for this ticket.');
  return result;
}
export function TicketAiPanel({ ticket, onChanged, onBusy, onVisit }: {
  ticket: ProjectTicket; onChanged(): void; onBusy(value: boolean): void; onVisit(id: string): void;
}) {
  const [state, setState] = useState<State>();
  const [open, setOpen] = useState(false);
  const [action, setAction] = useState<'text' | 'breakdown'>('breakdown');
  const [modelReady, setModelReady] = useState(false);
  const [selection, setSelection] = useState(defaultAiModelSelection);
  const [defaults, setDefaults] = useState<{ planning?: AiModelSelection; execution?: AiModelSelection }>({});
  const [suggestions, setSuggestions] = useState<SuggestedTicket[]>([]);
  const [excluded, setExcluded] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  function display(next: State) {
    setState(next); setSuggestions(next.draft?.suggestions ?? []); setExcluded([]);
  }
  useEffect(() => {
    let current = true;
    void request(ticket.id).then(next => {
      if (current) { display(next); if (next.draft) setSelection(next.draft.selection); }
    }, error => { if (current) setError(error.message); });
    return () => { current = false; };
  }, [ticket.id]);
  useEffect(() => {
    let current = true;
    void projectSettings(ticket.projectId).then(value => {
      if (!current) return;
      setDefaults(value);
      if (value.planning) setSelection(old => old.model ? old : value.planning!);
    }).catch(() => {});
    return () => { current = false; };
  }, [ticket.projectId]);
  async function act(name: string, input: unknown) {
    setBusy(true); onBusy(true); setError('');
    try { display(await request(ticket.id, name, input)); onChanged(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'AI action failed.'); }
    finally { setBusy(false); onBusy(false); }
  }
  if (ticket.coding?.issueNumber) return null;
  const draft = state?.draft;
  const requirements = draft?.requirements ?? ticket.acceptanceCriteria.split(/\r?\n/).map(text => text.trim()).filter(Boolean)
    .map((text, index) => ({ id: 'A' + (index + 1), text }));
  return <details className="ticket-ai" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>{draft?.children.length ? t('Breakdown') : t('Run AI')}</summary>
    {error && <p role="alert">{t(error)}</p>}
    {ticket.status === 'backlog' && !draft?.children.length && open && <>
      <label>{t("Action")}<select value={action} disabled={busy} onChange={event => {
        const next = event.target.value === 'text' ? 'text' : 'breakdown';
        setAction(next); setSelection((next === 'text' ? defaults.execution : defaults.planning) ?? defaultAiModelSelection);
      }}>
        <option value="breakdown">{t("Break down")}</option>
        {ticket.executionMode === 'manual' && <option value="text">{t("Execute as a written result")}</option>}
      </select></label>
      <ModelPicker value={selection} onChange={setSelection} onReadyChange={setModelReady} disabled={busy} />
      <p>{t("Uses")} {selection.provider === 'codex' ? t('ChatGPT Codex allowance') : aiProviderNames[selection.provider] + t(' API balance')} {t("and sends the ticket and project context.")}</p>
      <button className="primary" disabled={busy || !modelReady} onClick={() => void act('run', { action, selection, confirm: true })}>
        {action === 'breakdown' ? t('Generate breakdown') : t('Generate result')}
      </button>
    </>}
    {busy && <button onClick={() => void request(ticket.id, 'stop').catch(error => setError(error.message))}>{t("Stop AI")}</button>}
    {draft?.result && <pre className="ticket-result">{draft.result}</pre>}
    {!!draft?.children.length && <ul>{draft.children.map((child, index) => <li key={child}>
      <button className="text-button" onClick={() => onVisit(child)}>{draft.suggestions[index]?.title ?? t('Open child ticket')}</button>
      {!!draft.suggestions[index]?.requirementIds?.length && <span> {t("Covers")} {draft.suggestions[index]!.requirementIds!.join(', ')}</span>}
    </li>)}</ul>}
    {!!suggestions.length && !draft?.children.length && <div>
      {suggestions.map((item, index) => <details key={item.key}><summary>{item.title}</summary>
        <label><input type="checkbox" checked={!excluded.includes(item.key)} onChange={event => setExcluded(current =>
          event.target.checked ? current.filter(key => key !== item.key) : [...current, item.key])} /> {t("Include")}</label>
        {(['title', 'description', 'acceptanceCriteria'] as const).map(key => <label key={key}>
          {key === 'acceptanceCriteria' ? t('Acceptance criteria') : key === 'title' ? t('Title') : t('Description')}
          <textarea value={item[key]} onChange={event => setSuggestions(current => current.map((value, position) =>
            position === index ? { ...value, [key]: event.target.value } : value))} />
        </label>)}
        {!!requirements.length && <fieldset><legend>{t("Parent acceptance items covered")}</legend>
          {requirements.map(requirement => <label key={requirement.id}><input type="checkbox"
            checked={item.requirementIds?.includes(requirement.id) ?? false}
            onChange={event => {
              const checked = event.target.checked;
              setSuggestions(current => current.map(value => value.key !== item.key ? value : {
                ...value, requirementIds: checked ? [...(value.requirementIds ?? []), requirement.id]
                  : (value.requirementIds ?? []).filter(id => id !== requirement.id),
              }));
            }} /> {requirement.id} {requirement.text}</label>)}
        </fieldset>}
        <p>{item.prerequisiteKeys.length ? t('Requires ') + item.prerequisiteKeys.join(', ') : t('No proposed prerequisites')}</p>
      </details>)}
      <button className="primary" disabled={busy || suggestions.length - excluded.length < 2} onClick={() => void act('apply', {
        id: draft?.id, suggestions: suggestions.filter(item => !excluded.includes(item.key)),
      })}>{t("Create tickets")}</button>
    </div>}
  </details>;
}
