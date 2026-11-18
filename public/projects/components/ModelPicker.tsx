import { t } from '../../workspace/locale.ts';
import { useEffect, useState } from 'react';
import { createAiClient } from '../../../src/client/ai.ts';
import { aiProviderNames } from '../../../src/shared/ai.ts';
import type { AiConnection, AiModel, AiModelSelection } from '../../../src/shared/ai.ts';

const api = createAiClient();
export function ModelPicker({ value, onChange, onReadyChange, disabled = false }: {
  value: AiModelSelection; onChange(value: AiModelSelection): void; onReadyChange?(ready: boolean): void; disabled?: boolean;
}) {
  const [connections, setConnections] = useState<AiConnection[]>([]);
  const [catalog, setCatalog] = useState<{ provider: AiModelSelection['provider']; items: AiModel[] }>();
  const [request, refresh] = useState(0);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const abort = new AbortController();
    setLoading(true); setCatalog(undefined); setError('');
    void api.connections(abort.signal).then(async list => {
      if (abort.signal.aborted) return;
      setConnections(list.filter(item => item.connected));
      if (!list.some(item => item.connected && item.provider === value.provider)) throw new Error('Connect a provider or choose an available account.');
      const next = await api.models(value.provider, abort.signal);
      if (!abort.signal.aborted) setCatalog({ provider: value.provider, items: next });
    }).catch(error => { if (!abort.signal.aborted) setError(error.message); })
      .finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [value.provider, request]);
  const models = catalog?.provider === value.provider ? catalog.items : [];
  const chosen = models.find(item => item.id === value.model);
  const effortAvailable = !value.effort || !!chosen?.efforts.includes(value.effort);
  const ready = !loading && !!chosen && effortAvailable;
  useEffect(() => { onReadyChange?.(ready); }, [ready, onReadyChange]);
  return <div className="inline-settings">
    <label>{t("Provider")}<select value={connections.some(item => item.provider === value.provider) ? value.provider : ''} disabled={disabled}
      onChange={event => { const option = connections.find(item => item.provider === event.target.value);
        if (option) onChange({ provider: option.provider, model: '', effort: '' }); }}>
      <option value="" disabled>{t("Choose a connection")}</option>
      {connections.map(item => <option value={item.provider} key={item.provider}>{aiProviderNames[item.provider]}</option>)}
    </select></label>
    <label>{t("Model")}<select value={chosen?.id ?? ''} disabled={disabled || loading} onChange={event => onChange({ ...value, model: event.target.value, effort: '' })}>
      <option value="">{t("Choose a model")}</option>{models.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
    </select></label>
    <label>{t("Effort")}<select value={!chosen ? '' : effortAvailable ? value.effort : 'unavailable'} disabled={disabled || loading || !chosen}
      onChange={event => onChange({ ...value, effort: event.target.value })}>
      {chosen && !effortAvailable && <option value="unavailable" disabled>{t("Saved effort unavailable")}</option>}
      <option value="">{t("Provider default")}</option>{chosen?.efforts.map(item => <option key={item} value={item}>{item}</option>)}
    </select></label>
    <button className="quiet-button" type="button" disabled={disabled || loading} onClick={() => refresh(value => value + 1)}>{t("Refresh models")}</button>
    {loading && <p role="status">{t("Loading models")}</p>}
    {error && <p role="alert">{t(error)}</p>}
    {!loading && !error && value.model && !chosen && <p role="alert">{t("The saved model is unavailable. Choose a current model.")}</p>}
    {!loading && chosen && !effortAvailable && <p role="alert">{t("The saved effort is unavailable. Choose an effort or Provider default.")}</p>}
  </div>;
}
