import type { DatabaseSync } from 'node:sqlite';
import { parsePlanDraft } from '../shared/plans.ts';
import type { PlanDraft } from '../shared/plans.ts';

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
