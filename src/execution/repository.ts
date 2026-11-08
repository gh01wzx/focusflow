import type { DatabaseSync } from 'node:sqlite';
import type { CodingWorkspace } from '../shared/execution.ts';
import type { CodingRun } from '../shared/coding.ts';

export function createExecutionRepository(db: DatabaseSync) {
  return {
    latestRun(id:string):CodingRun|null {
      const row=db.prepare('SELECT run_json FROM coding_runs WHERE ticket_id=? ORDER BY rowid DESC LIMIT 1').get(id);
      return row?JSON.parse(String(row.run_json)) as CodingRun:null;
    },
    runs():CodingRun[] { return db.prepare('SELECT run_json FROM coding_runs ORDER BY rowid').all().map(row=>JSON.parse(String(row.run_json)) as CodingRun); },
    saveRun(run:CodingRun) {
      db.prepare('INSERT INTO coding_runs(id,ticket_id,stage,run_json) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET stage=excluded.stage,run_json=excluded.run_json')
        .run(run.id,run.ticketId,run.stage,JSON.stringify(run));
    },
    workspace(id: string): CodingWorkspace | null {
      const row = db.prepare('SELECT workspace_json FROM coding_workspaces WHERE ticket_id=?').get(id);
      return row ? JSON.parse(String(row.workspace_json)) as CodingWorkspace : null;
    },
    saveWorkspace(value: CodingWorkspace) {
      db.prepare('INSERT INTO coding_workspaces(ticket_id,workspace_json) VALUES(?,?) ON CONFLICT(ticket_id) DO UPDATE SET workspace_json=excluded.workspace_json')
        .run(value.ticketId, JSON.stringify(value));
    },
  };
}
export type ExecutionRepository = ReturnType<typeof createExecutionRepository>;
