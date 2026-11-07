import type { PlanDraft, PlanApproval } from '../shared/plans.ts';
import { parsePlanDraft, selectedPlan } from '../shared/plans.ts';
import type { PlanRepository, PlanApprovalRepository } from './repository.ts';
import type { ProjectRepository } from '../projects/repository.ts';
import type { ProjectTransaction } from '../projects/service.ts';

export class PlanInputError extends Error {}

export function createPlanApprovalService(drafts: PlanRepository, approvals: PlanApprovalRepository,
  projects: ProjectRepository, transaction: ProjectTransaction, nextId: () => string) {
  function checked(projectId: string, input: unknown): { draft: PlanDraft; value: Record<string, unknown> } {
    const value = input && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, unknown> : {};
    const draft = drafts.read(projectId);
    if (!draft || value.draftId !== draft.id || value.revision !== (draft.revision ?? draft.id)) {
      throw new PlanInputError('This draft changed. Close and reopen it before editing or approving.');
    }
    return { draft, value };
  }
  return {
    receipt: (draftId: string) => approvals.read(draftId),
    edit: (projectId: string, input: unknown) => transaction(() => {
      const { draft, value } = checked(projectId, input);
      if (approvals.read(draft.id)) throw new PlanInputError('This plan is already approved. Edit its saved tickets or generate a new draft.');
      let next: PlanDraft;
      try { next = parsePlanDraft({ ...draft, plan: value.plan, selectedTicketKeys: value.selectedTicketKeys, revision: nextId() }); }
      catch { throw new PlanInputError('Check titles, acceptance criteria, work types and prerequisite links. Nothing was saved.'); }
      if (!Array.isArray(value.selectedTicketKeys)) throw new PlanInputError('Choose which tasks to include.');
      drafts.save(next);
    }),
    approve: (projectId: string, input: unknown) => transaction(now => {
      const { draft, value } = checked(projectId, input);
      if (value.confirm !== true) throw new PlanInputError('Confirm the preview before creating the selected plan.');
      if (approvals.read(draft.id)) return;
      let plan;
      try { plan = selectedPlan(draft); }
      catch (error) { throw new PlanInputError(error instanceof Error ? error.message : 'Check the selected plan.'); }
      const at = now.toISOString();
      const receipt: PlanApproval = { draftId: draft.id, projectId, approvedAt: at, milestoneIds: [], ticketIds: [], codingTicketIds: [] };
      const ids = new Map<string, string>();
      for (const milestone of plan.milestones) {
        const milestoneId = nextId(); receipt.milestoneIds.push(milestoneId);
        projects.insertMilestone({ id: milestoneId, projectId, title: milestone.title.trim(), description: milestone.description, createdAt: at });
        for (const ticket of milestone.tickets) {
          const id = nextId(); ids.set(ticket.key, id); receipt.ticketIds.push(id);
          if (ticket.executionMode === 'codex') receipt.codingTicketIds.push(id);
          projects.insertTicket({ id, projectId, milestoneId, title: ticket.title.trim(), description: ticket.description,
            acceptanceCriteria: ticket.acceptanceCriteria, executionMode: ticket.executionMode,
            status: 'backlog', blockReason: '', createdAt: at, updatedAt: at });
        }
      }
      for (const ticket of plan.milestones.flatMap(milestone => milestone.tickets)) {
        projects.setDependencies(ids.get(ticket.key)!, ticket.prerequisiteKeys.map(key => ids.get(key)!), at);
      }
      approvals.save(receipt, plan);
    }),
  };
}
export type PlanApprovalService = ReturnType<typeof createPlanApprovalService>;
