export interface SuggestedTicket {
  key: string; title: string; description: string; acceptanceCriteria: string;
  executionMode: 'manual' | 'codex'; prerequisiteKeys: string[];
}
export interface SuggestedMilestone { key: string; title: string; description: string; tickets: SuggestedTicket[] }
export interface SuggestedPlan { milestones: SuggestedMilestone[] }
export interface PlanDraft { id: string; projectId: string; goal: string; createdAt: string; plan: SuggestedPlan }
export interface PlanState { draft: PlanDraft | null; busy: boolean; cancelling: boolean; message: string }

function invalid(): never { throw new Error('The AI plan format is invalid. Try another explicit request; the previous draft is kept.'); }
function object(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !keys.includes(key))) invalid();
  return value as Record<string, unknown>;
}
function text(value: unknown, max: number, required = false): string {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) invalid();
  return value;
}
function key(value: unknown) {
  const result = text(value, 48, true);
  if (!/^[a-z][a-z0-9-]*$/.test(result)) invalid();
  return result;
}
export function parseSuggestedPlan(value: unknown): SuggestedPlan {
  const source = object(value, ['milestones']);
  if (!Array.isArray(source.milestones) || source.milestones.length < 1 || source.milestones.length > 8) invalid();
  const keys = new Set<string>();
  function unique(value: unknown) { const id = key(value); if (keys.has(id)) invalid(); keys.add(id); return id; }
  const milestones = source.milestones.map(value => {
    const item = object(value, ['key', 'title', 'description', 'tickets']);
    const id = unique(item.key);
    if (!Array.isArray(item.tickets) || item.tickets.length < 1 || item.tickets.length > 12) invalid();
    const tickets = item.tickets.map((value): SuggestedTicket => {
      const ticket = object(value, ['key', 'title', 'description', 'acceptanceCriteria', 'executionMode', 'prerequisiteKeys']);
      if (ticket.executionMode !== 'manual' && ticket.executionMode !== 'codex') invalid();
      if (!Array.isArray(ticket.prerequisiteKeys) || ticket.prerequisiteKeys.length > 16) invalid();
      const prerequisiteKeys = ticket.prerequisiteKeys.map(key);
      if (new Set(prerequisiteKeys).size !== prerequisiteKeys.length) invalid();
      return { key: unique(ticket.key), title: text(ticket.title, 200, true), description: text(ticket.description, 2000),
        acceptanceCriteria: text(ticket.acceptanceCriteria, 2000, true), executionMode: ticket.executionMode, prerequisiteKeys };
    });
    return { key: id, title: text(item.title, 200, true), description: text(item.description, 2000), tickets };
  });
  const tickets = milestones.flatMap(item => item.tickets);
  if (tickets.length > 40) invalid();
  const byId = new Map(tickets.map(ticket => [ticket.key, ticket]));
  const done = new Set<string>(); const visiting = new Set<string>();
  function visit(id: string) {
    if (visiting.has(id) || !byId.has(id)) invalid();
    if (done.has(id)) return;
    visiting.add(id);
    for (const prerequisite of byId.get(id)!.prerequisiteKeys) visit(prerequisite);
    visiting.delete(id); done.add(id);
  }
  for (const ticket of tickets) visit(ticket.key);
  return { milestones };
}
export function parsePlanDraft(value: unknown): PlanDraft {
  const item = object(value, ['id', 'projectId', 'goal', 'createdAt', 'plan']);
  const id = text(item.id, 36, true), projectId = text(item.projectId, 36, true);
  if (!/^[a-f0-9-]{36}$/.test(id) || !/^[a-f0-9-]{36}$/.test(projectId)) invalid();
  const createdAt = text(item.createdAt, 32, true);
  if (!Number.isFinite(Date.parse(createdAt))) invalid();
  return { id, projectId, createdAt, goal: text(item.goal, 3000, true), plan: parseSuggestedPlan(item.plan) };
}
export function parsePlanState(value: unknown): PlanState {
  const item = object(value, ['draft', 'busy', 'cancelling', 'message']);
  if (typeof item.busy !== 'boolean' || typeof item.cancelling !== 'boolean' || (item.cancelling && !item.busy)) invalid();
  return { draft: item.draft === null ? null : parsePlanDraft(item.draft), busy: item.busy,
    cancelling: item.cancelling, message: text(item.message, 600) };
}
