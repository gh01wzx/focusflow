import type { PersonalView } from '../shared/personal.ts';

export async function readPersonal(action?: string, input?: unknown): Promise<{ view: PersonalView; award: number }> {
  const response = await fetch('/api/personal' + (action ? '/' + action : ''), action ? {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
  } : {});
  const payload: unknown = await response.json();
  if (!payload || typeof payload !== 'object') throw new Error('Could not read Personal data.');
  const result = payload as Record<string, unknown>;
  if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : 'Could not save Personal data.');
  const view = (action ? result.view : result) as PersonalView | undefined;
  if (!view || typeof view.day !== 'string' || !Number.isSafeInteger(view.balance)
      || !Number.isSafeInteger(view.earned) || !Array.isArray(view.entries) || !Array.isArray(view.rules)
      || !Array.isArray(view.rewards) || !view.progress || !view.week || !Array.isArray(view.week.days) || !view.week.minutes
      || !view.week.points || !view.recent || !view.votes || !view.preferences) throw new Error('Could not read Personal data.');
  return { view, award: action && typeof result.award === 'number' && Number.isSafeInteger(result.award) ? result.award : 0 };
}
