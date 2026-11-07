import type { DatabaseSync } from 'node:sqlite';
import { parsePublicationState } from '../shared/publication.ts';
import type { PublicationBatch, PublicationItem, PublicationStage } from '../shared/publication.ts';

export function createPublicationRepository(db: DatabaseSync) {
  return {
    read(projectId: string): PublicationBatch | null {
      const batch = db.prepare('SELECT * FROM publication_batches WHERE project_id=? ORDER BY rowid DESC LIMIT 1').get(projectId);
      if (!batch) return null;
      const items = db.prepare('SELECT * FROM issue_publications WHERE batch_id=? ORDER BY rowid').all(String(batch.id));
      return parsePublicationState({ busy: false, message: '', batch: { id: batch.id, projectId, repository: JSON.parse(String(batch.repository_json)) as unknown,
        approvedAt: batch.approved_at, items: items.map(row => ({ content: JSON.parse(String(row.content_json)) as unknown,
          stage: row.stage, issueNumber: row.issue_number, message: row.message })) } }).batch;
    },
    approvedTicketIds(projectId: string): Set<string> {
      return new Set(db.prepare('SELECT receipt_json FROM plan_approvals WHERE project_id=?').all(projectId)
        .flatMap(row => (JSON.parse(String(row.receipt_json)) as { codingTicketIds: string[] }).codingTicketIds));
    },
    insert(batch: PublicationBatch) {
      db.prepare('INSERT INTO publication_batches VALUES(?,?,?,NULL)').run(batch.id, batch.projectId, JSON.stringify(batch.repository));
      for (const item of batch.items) db.prepare('INSERT INTO issue_publications(ticket_id,batch_id,content_json,stage) VALUES(?,?,?,?)')
        .run(item.content.ticketId, batch.id, JSON.stringify(item.content), item.stage);
    },
    discardUnapproved(batchId: string) {
      db.prepare('DELETE FROM issue_publications WHERE batch_id=? AND EXISTS(SELECT 1 FROM publication_batches WHERE id=? AND approved_at IS NULL)').run(batchId, batchId);
      db.prepare('DELETE FROM publication_batches WHERE id=? AND approved_at IS NULL').run(batchId);
    },
    approve(batchId: string, at: string) { db.prepare('UPDATE publication_batches SET approved_at=? WHERE id=? AND approved_at IS NULL').run(at, batchId); },
    abandon(batchId: string) {
      if (db.prepare("SELECT 1 FROM issue_publications WHERE batch_id=? AND (stage!='pending' OR issue_number IS NOT NULL)").get(batchId)) throw new Error('Publication already attempted or linked.');
      db.prepare('DELETE FROM issue_publications WHERE batch_id=?').run(batchId);
      db.prepare('DELETE FROM publication_batches WHERE id=?').run(batchId);
    },
    setItem(id: string, stage: PublicationStage, number: number | null, message = '') {
      db.prepare('UPDATE issue_publications SET stage=?,issue_number=?,message=? WHERE ticket_id=?').run(stage, number, message, id);
    },
    link(item: PublicationItem, batch: PublicationBatch, number: number) {
      const current = db.prepare('SELECT repository_json,issue_number FROM coding_tickets WHERE ticket_id=?').get(item.content.ticketId);
      if (!current || current.issue_number !== null && (current.issue_number !== number || current.repository_json !== JSON.stringify(batch.repository))) throw new Error('Coding identity changed.');
      db.prepare('UPDATE coding_tickets SET repository_json=?,issue_number=? WHERE ticket_id=?').run(JSON.stringify(batch.repository), number, item.content.ticketId);
    },
  };
}
export type PublicationRepository = ReturnType<typeof createPublicationRepository>;
