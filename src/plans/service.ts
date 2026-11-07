import { randomUUID } from 'node:crypto';
import { parseSuggestedPlan } from '../shared/plans.ts';
import type { PlanState, SuggestedPlan } from '../shared/plans.ts';
import type { PlanRepository } from './repository.ts';

export type PlanProgress = 'checking' | 'waiting' | 'responding' | 'retrying';
export interface PlanGenerator {
  generate(goal: string, signal: AbortSignal, progress: (kind: PlanProgress) => void): Promise<SuggestedPlan>;
}
export class PlanInputError extends Error {}
export class PlanGenerationError extends Error {
  readonly code: string;
  constructor(code: string) { super('AI planning could not complete.'); this.code = code; }
}
function failure(error: unknown) {
  const code = error instanceof PlanGenerationError ? error.code : '';
  if (code === 'MISSING') return 'Install the pinned runtime with npm run ai:install, then use AI connection to sign in.';
  if (code === 'AUTH_REQUIRED') return 'Open AI connection and sign in with ChatGPT. API-key billing is not supported.';
  if (code === 'BUSY') return 'Another AI request is active. Wait or cancel it before requesting a plan.';
  if (code === 'USAGE_LIMIT') return 'Codex allowance is exhausted. Check your ChatGPT plan and try after its limit resets.';
  if (code === 'RATE_LIMITED' || code === 'CONNECTION_FAILED') return 'AI could not connect or is rate limited. Retry explicitly when ready.';
  return 'AI could not return a valid plan. The previous draft and project tasks are unchanged. Retry explicitly when ready.';
}
export function createPlanService(repository: PlanRepository, generator: PlanGenerator) {
  const messages = new Map<string, string>();
  let active: { projectId: string; abort: AbortController; promise: Promise<void> } | null = null;
  let closed = false;
  function status(projectId: string): PlanState {
    const current = active?.projectId === projectId ? active : null;
    return { draft: repository.read(projectId), busy: !!current, cancelling: current?.abort.signal.aborted ?? false,
      message: messages.get(projectId) ?? 'Draft suggestions are private. Generating a plan does not create project tickets or GitHub Issues.' };
  }
  return {
    status,
    start(projectId: string, input: unknown) {
      const value = input && typeof input === 'object' ? input as Record<string, unknown> : {};
      if (value.confirmAllowance !== true) throw new PlanInputError('Confirm that generating a plan uses Codex allowance.');
      if (typeof value.goal !== 'string' || !value.goal.trim() || value.goal.length > 3000) throw new PlanInputError('Describe a goal using 1 to 3,000 characters.');
      if (closed) throw new PlanInputError('Planning is closing. Reopen FocusFlow before another request.');
      if (active) throw new PlanInputError('Another plan request is active. Wait or cancel it first.');
      const goal = value.goal.trim();
      const owned = { projectId, abort: new AbortController(), promise: Promise.resolve() };
      active = owned; messages.set(projectId, 'Checking the AI account.');
      owned.promise = (async () => {
        try {
          const plan = parseSuggestedPlan(await generator.generate(goal, owned.abort.signal, kind => {
            if (active !== owned || owned.abort.signal.aborted) return;
            messages.set(projectId, { checking: 'Checking the AI account.', waiting: 'Waiting for an AI draft.',
              responding: 'AI is responding.', retrying: 'The provider is retrying the current request.' }[kind]);
          }));
          if (owned.abort.signal.aborted || closed) return;
          repository.save({ id: randomUUID(), projectId, goal, createdAt: new Date().toISOString(), plan });
          messages.set(projectId, 'Draft saved locally. Suggestions are not approved tasks.');
        } catch (error) { if (!owned.abort.signal.aborted) messages.set(projectId, failure(error)); }
        finally {
          if (owned.abort.signal.aborted) messages.set(projectId, 'Plan request cancelled. The previous draft and project tasks are unchanged. A request already sent may use allowance.');
          if (active === owned) active = null;
        }
      })();
      return status(projectId);
    },
    cancel(projectId: string) {
      if (active?.projectId === projectId) { active.abort.abort(); messages.set(projectId, 'Stopping the plan request.'); }
      return status(projectId);
    },
    async close() { closed = true; active?.abort.abort(); if (active) await active.promise; },
  };
}
