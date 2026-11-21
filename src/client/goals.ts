import { parseGoalsView } from '../shared/goals.ts';
import type { GoalAction } from '../shared/goals.ts';

async function request(path: string, body?: unknown) {
  const response = await fetch('/api/goals' + path, body === undefined ? { cache: 'no-store' }
    : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = payload && typeof payload === 'object' && 'error' in payload ? payload.error : undefined;
    throw new Error(typeof error === 'string' ? error : 'Could not reach the local service.');
  }
  return parseGoalsView(payload);
}

export const readGoals = () => request('');
export const addGoal = (title: string) => request('', { title });
export const updateGoal = (id: string, action: GoalAction) => request('/' + encodeURIComponent(id) + '/' + action, {});
