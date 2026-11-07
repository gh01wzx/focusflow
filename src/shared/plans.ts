export interface SuggestedTicket {
  key: string; title: string; description: string; acceptanceCriteria: string;
  executionMode: 'manual' | 'codex'; prerequisiteKeys: string[];
}
export interface SuggestedMilestone { key: string; title: string; description: string; tickets: SuggestedTicket[] }
export interface SuggestedPlan { milestones: SuggestedMilestone[] }
export interface PlanDraft {
  id: string; projectId: string; goal: string; createdAt: string; plan: SuggestedPlan;
  revision?: string; selectedTicketKeys?: string[];
}
export interface PlanApproval {
  draftId: string; projectId: string; approvedAt: string;
  milestoneIds: string[]; ticketIds: string[]; codingTicketIds: string[];
}
export interface PlanState { draft: PlanDraft | null; busy: boolean; cancelling: boolean; message: string; approval?: PlanApproval | null }

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
  const item = object(value, ['id', 'projectId', 'goal', 'createdAt', 'plan', 'revision', 'selectedTicketKeys']);
  const id = text(item.id, 36, true), projectId = text(item.projectId, 36, true);
  if (!/^[a-f0-9-]{36}$/.test(id) || !/^[a-f0-9-]{36}$/.test(projectId)) invalid();
  const createdAt = text(item.createdAt, 32, true);
  if (!Number.isFinite(Date.parse(createdAt))) invalid();
  const plan = parseSuggestedPlan(item.plan);
  if (item.revision !== undefined && (typeof item.revision !== 'string' || !/^[a-f0-9-]{36}$/.test(item.revision))) invalid();
  const ticketKeys = new Set(plan.milestones.flatMap(milestone => milestone.tickets.map(ticket => ticket.key)));
  if (item.selectedTicketKeys !== undefined && (!Array.isArray(item.selectedTicketKeys)
    || item.selectedTicketKeys.some(key => typeof key !== 'string' || !ticketKeys.has(key))
    || new Set(item.selectedTicketKeys).size !== item.selectedTicketKeys.length)) invalid();
  return { id, projectId, createdAt, goal: text(item.goal, 3000, true), plan,
    ...(item.revision === undefined ? {} : { revision: item.revision as string }),
    ...(item.selectedTicketKeys === undefined ? {} : { selectedTicketKeys: item.selectedTicketKeys as string[] }) };
}
export function selectedPlan(draft: PlanDraft): SuggestedPlan {
  const selected = new Set(draft.selectedTicketKeys ?? draft.plan.milestones.flatMap(milestone => milestone.tickets.map(ticket => ticket.key)));
  if (!selected.size) throw new Error('Select at least one task before approval.');
  const milestones = draft.plan.milestones.map(milestone => ({ ...milestone, tickets: milestone.tickets.filter(ticket => selected.has(ticket.key)) }))
    .filter(milestone => milestone.tickets.length > 0);
  const tickets = draft.plan.milestones.flatMap(milestone => milestone.tickets);
  for (const ticket of milestones.flatMap(milestone => milestone.tickets)) {
    const missing = ticket.prerequisiteKeys.find(key => !selected.has(key));
    if (missing) throw new Error('Include the prerequisite "' + tickets.find(item => item.key === missing)!.title + '" or remove its link before approval.');
  }
  return parseSuggestedPlan({ milestones });
}
export function parsePlanApproval(value: unknown): PlanApproval {
  const item = object(value, ['draftId', 'projectId', 'approvedAt', 'milestoneIds', 'ticketIds', 'codingTicketIds']);
  const ids = (value: unknown, max: number): string[] => {
    if (!Array.isArray(value) || value.length > max || value.some(id => typeof id !== 'string' || !/^[a-f0-9-]{36}$/.test(id))
      || new Set(value).size !== value.length) invalid();
    return value as string[];
  };
  const draftId = ids([item.draftId], 1)[0]!, projectId = ids([item.projectId], 1)[0]!;
  const approvedAt = text(item.approvedAt, 32, true);
  if (!Number.isFinite(Date.parse(approvedAt))) invalid();
  const milestoneIds = ids(item.milestoneIds, 8), ticketIds = ids(item.ticketIds, 40), codingTicketIds = ids(item.codingTicketIds, 40);
  if (!milestoneIds.length || !ticketIds.length || codingTicketIds.some(id => !ticketIds.includes(id))) invalid();
  return { draftId, projectId, approvedAt, milestoneIds, ticketIds, codingTicketIds };
}
export function parsePlanState(value: unknown): PlanState {
  const item = object(value, ['draft', 'busy', 'cancelling', 'message', 'approval']);
  if (typeof item.busy !== 'boolean' || typeof item.cancelling !== 'boolean' || (item.cancelling && !item.busy)) invalid();
  const draft = item.draft === null ? null : parsePlanDraft(item.draft);
  const approval = item.approval == null ? null : parsePlanApproval(item.approval);
  if (approval && (!draft || approval.projectId !== draft.projectId || approval.draftId !== draft.id)) invalid();
  return { draft, busy: item.busy, cancelling: item.cancelling, message: text(item.message, 600),
    ...(item.approval === undefined ? {} : { approval }) };
}
