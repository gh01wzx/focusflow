import type { DatabaseSync } from 'node:sqlite';
import type { CodingWorkspace } from '../shared/execution.ts';

export function createExecutionRepository(db: DatabaseSync) {
  return {
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
