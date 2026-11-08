import type { DatabaseSync } from 'node:sqlite';
import type { LinkedIssue, LinkedPull, LinkedFields } from '../shared/linked-work.ts';
import { parseLinkedIssue, parseLinkedPull } from '../shared/linked-work.ts';

export function createLinkedWorkRepository(db: DatabaseSync) {
  const ensure = (id: string) => db.prepare('INSERT OR IGNORE INTO linked_work(ticket_id) VALUES(?)').run(id);
  return {
    read(id: string) {
      const row = db.prepare('SELECT * FROM linked_work WHERE ticket_id=?').get(id);
      const published = db.prepare('SELECT content_json FROM issue_publications WHERE ticket_id=?').get(id);
      const original = published ? JSON.parse(String(published.content_json)) as LinkedFields : null;
      return { remote: row?.remote_issue_json ? parseLinkedIssue(JSON.parse(String(row.remote_issue_json))) : null,
        pull: row?.remote_pull_json ? parseLinkedPull(JSON.parse(String(row.remote_pull_json))) : null,
        pullNumber: row?.pr_number ? Number(row.pr_number) : null, lastSuccess: row?.last_success ? String(row.last_success) : null,
        error: row?.last_error ? String(row.last_error) : '',
        baseline: row?.base_fields_json ? JSON.parse(String(row.base_fields_json)) as LinkedFields
          : original ? { title: original.title, description: original.description, acceptanceCriteria: original.acceptanceCriteria } : null };
    },
    refresh(id: string, issue: LinkedIssue, pull: LinkedPull | null, at: string) {
      ensure(id); db.prepare('UPDATE linked_work SET remote_issue_json=?,remote_pull_json=?,last_success=?,last_error=? WHERE ticket_id=?')
        .run(JSON.stringify(issue), pull ? JSON.stringify(pull) : null, at, '', id);
    },
    error(id: string, message: string) { ensure(id); db.prepare('UPDATE linked_work SET last_error=? WHERE ticket_id=?').run(message, id); },
    baseline(id: string, fields: LinkedFields) { ensure(id); db.prepare('UPDATE linked_work SET base_fields_json=? WHERE ticket_id=?').run(JSON.stringify(fields), id); },
    linkPull(id: string, pull: LinkedPull) {
      ensure(id); db.prepare('UPDATE linked_work SET pr_number=?,remote_pull_json=? WHERE ticket_id=?').run(pull.number, JSON.stringify(pull), id);
    },
  };
}
export type LinkedWorkRepository = ReturnType<typeof createLinkedWorkRepository>;
