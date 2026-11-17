import { useEffect, useState } from 'react';
import { createAiClient } from '../../../src/client/ai.ts';
import { aiProviderNames } from '../../../src/shared/ai.ts';
import type { AiConnection, AiModel, AiModelSelection } from '../../../src/shared/ai.ts';

const api = createAiClient();
export function ModelPicker({ value, onChange, coding = false, disabled = false }: {
  value: AiModelSelection; onChange(value: AiModelSelection): void; coding?: boolean; disabled?: boolean;
}) {
  const [connections, setConnections] = useState<AiConnection[]>([]);
  const [models, setModels] = useState<AiModel[]>([]);
  const [request, refresh] = useState(0);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const abort = new AbortController();
    setLoading(true); setModels([]); setError('');
    void api.connections(abort.signal).then(async list => {
      if (abort.signal.aborted) return;
      setConnections(list.filter(item => item.connected && (!coding || item.provider === 'codex')));
      if (!list.some(item => item.connected && item.provider === value.provider)) throw new Error('Connect a provider or choose an available account.');
      const next = await api.models(value.provider, abort.signal);
      if (!abort.signal.aborted) setModels(next);
    }).catch(error => { if (!abort.signal.aborted) setError(error.message); })
      .finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [value.provider, request, coding]);
  const chosen = models.find(item => item.id === value.model);
  return <div className="inline-settings">
    <label>Provider<select value={connections.some(item => item.provider === value.provider) ? value.provider : ''} disabled={disabled}
      onChange={event => { const option = connections.find(item => item.provider === event.target.value);
        if (option) onChange({ provider: option.provider, model: '', effort: '' }); }}>
      <option value="" disabled>Choose a connection</option>
      {connections.map(item => <option value={item.provider} key={item.provider}>{aiProviderNames[item.provider]}</option>)}
    </select></label>
    <label>Model<select value={chosen?.id ?? ''} disabled={disabled || loading} onChange={event => onChange({ ...value, model: event.target.value, effort: '' })}>
      <option value="">Choose a model</option>{models.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
    </select></label>
    <label>Effort<select value={chosen?.efforts.includes(value.effort) ? value.effort : ''} disabled={disabled || loading || !chosen}
      onChange={event => onChange({ ...value, effort: event.target.value })}>
      <option value="">Provider default</option>{chosen?.efforts.map(item => <option key={item} value={item}>{item}</option>)}
    </select></label>
    <button className="quiet-button" type="button" disabled={disabled || loading} onClick={() => refresh(value => value + 1)}>Refresh models</button>
    {loading && <p role="status">Loading models</p>}
    {error && <p role="alert">{error}</p>}
  </div>;
}
