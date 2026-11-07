import type { DatabaseSync } from 'node:sqlite';
import { parsePlanDraft, parsePlanApproval } from '../shared/plans.ts';
import type { PlanDraft, PlanApproval, SuggestedPlan } from '../shared/plans.ts';

export interface PlanRepository { read(projectId: string): PlanDraft | null; save(draft: PlanDraft): void }
export function createPlanRepository(db: DatabaseSync): PlanRepository {
  return {
    read(projectId) {
      const row = db.prepare('SELECT draft_json FROM plan_drafts WHERE project_id=?').get(projectId);
      return row ? parsePlanDraft(JSON.parse(String(row.draft_json))) : null;
    },
    save(draft) {
      const checked = parsePlanDraft(draft);
      db.prepare(`INSERT INTO plan_drafts(project_id,draft_json) VALUES(?,?)
        ON CONFLICT(project_id) DO UPDATE SET draft_json=excluded.draft_json`).run(checked.projectId, JSON.stringify(checked));
    },
  };
}

export function createPlanApprovalRepository(db: DatabaseSync) {
  return {
    read(draftId: string): PlanApproval | null {
      const row = db.prepare('SELECT receipt_json FROM plan_approvals WHERE draft_id=?').get(draftId);
      return row ? parsePlanApproval(JSON.parse(String(row.receipt_json))) : null;
    },
    save(receipt: PlanApproval, plan: SuggestedPlan) {
      db.prepare('INSERT INTO plan_approvals(draft_id,project_id,approved_plan_json,receipt_json) VALUES(?,?,?,?)')
        .run(receipt.draftId, receipt.projectId, JSON.stringify(plan), JSON.stringify(receipt));
    },
  };
}
export type PlanApprovalRepository = ReturnType<typeof createPlanApprovalRepository>;
