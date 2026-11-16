export type PlanningProvider = 'codex' | 'dsh';

export interface PlanningSelection {
  provider: PlanningProvider;
  model: string;
  effort: string;
}

export interface PlanningModel {
  id: string;
  label: string;
  efforts: string[];
  defaultEffort: string;
}

export const defaultPlanningSelection: PlanningSelection = { provider: 'codex', model: '', effort: '' };
export const DSH_VERSION = '0.2.2-rc.3';
export const DSH_MODELS: readonly PlanningModel[] = [
  { id: 'deepseek-v4-flash', label: 'DeepSeek V4 Flash', efforts: ['off', 'low', 'high', 'max'], defaultEffort: '' },
  { id: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro', efforts: ['off', 'low', 'high', 'max'], defaultEffort: '' },
];

export function parsePlanningSelection(value: unknown): PlanningSelection {
  if (value === undefined) return { ...defaultPlanningSelection };
  if (!value || typeof value !== 'object' || !('provider' in value) || !('model' in value) || !('effort' in value)
      || (value.provider !== 'codex' && value.provider !== 'dsh')
      || typeof value.model !== 'string' || !/^[a-z0-9._-]{0,120}$/i.test(value.model)
      || typeof value.effort !== 'string' || !/^[a-z0-9_-]{0,30}$/i.test(value.effort)
      || (!value.model && (value.effort || value.provider === 'dsh'))) {
    throw new Error('Choose a valid AI provider, model and reasoning effort.');
  }
  return { provider: value.provider, model: value.model, effort: value.effort };
}

export function supportsSelection(models: readonly PlanningModel[], selection: PlanningSelection): boolean {
  return models.some(model => model.id === selection.model && (!selection.effort || model.efforts.includes(selection.effort)));
}

export interface DshStatus {
  ready: boolean;
  verified: boolean;
  message: string;
}

export function parseDshStatus(value: unknown): DshStatus {
  if (!value || typeof value !== 'object' || !('ready' in value) || !('verified' in value) || !('message' in value)
      || typeof value.ready !== 'boolean' || typeof value.verified !== 'boolean' || typeof value.message !== 'string') {
    throw new Error('Could not read DeepSeek Harness connection.');
  }
  return { ready: value.ready, verified: value.verified, message: value.message };
}

export function parsePlanningModels(value: unknown): PlanningModel[] {
  if (!Array.isArray(value) || value.length > 250) throw new Error('Could not read available models.');
  return value.map((entry: unknown) => {
    if (!entry || typeof entry !== 'object' || !('id' in entry) || !('label' in entry)
        || !('efforts' in entry) || !('defaultEffort' in entry)
        || typeof entry.id !== 'string' || !entry.id || typeof entry.label !== 'string'
        || typeof entry.defaultEffort !== 'string' || !Array.isArray(entry.efforts)
        || !entry.efforts.every(effort => typeof effort === 'string')) throw new Error('Could not read a model option.');
    return { id: entry.id, label: entry.label, efforts: entry.efforts as string[], defaultEffort: entry.defaultEffort };
  });
}
