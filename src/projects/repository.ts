import type { DatabaseSync } from 'node:sqlite';
import { parseProject, parseMilestone, parseProjectTicket } from '../shared/project-codec.ts';
import type { Project, Milestone, ProjectTicket, TicketStatus, EntityDraft, TicketDetailsDraft, TicketDependency, ExecutionMode } from '../shared/projects.ts';

export function createProjectRepository(db: DatabaseSync) {
  const projectColumns = 'SELECT id,title,description,created_at AS createdAt FROM projects';
  const milestoneColumns = 'SELECT id,project_id AS projectId,title,description,created_at AS createdAt FROM milestones';
  const ticketColumns = `SELECT t.id,m.project_id AS projectId,t.milestone_id AS milestoneId,t.title,t.description,
    t.acceptance_criteria AS acceptanceCriteria,t.status,t.block_reason AS blockReason,t.execution_mode AS executionMode,
    t.created_at AS createdAt,t.updated_at AS updatedAt FROM project_tickets t
    JOIN milestones m ON m.id=t.milestone_id`;
  const projects = db.prepare(projectColumns + ' ORDER BY created_at,rowid');
  const projectById = db.prepare(projectColumns + ' WHERE id=?');
  const milestoneById = db.prepare(milestoneColumns + ' WHERE id=?');
  const milestones = db.prepare(milestoneColumns + ' WHERE project_id=? ORDER BY created_at,rowid');
  const tickets = db.prepare(ticketColumns + ' WHERE m.project_id=? ORDER BY t.created_at,t.rowid');
  const ticketById = db.prepare(ticketColumns + ' WHERE t.id=?');
  const insertProject = db.prepare('INSERT INTO projects(id,title,description,created_at) VALUES(?,?,?,?)');
  const insertMilestone = db.prepare('INSERT INTO milestones(id,project_id,title,description,created_at) VALUES(?,?,?,?,?)');
  const insertTicket = db.prepare(`INSERT INTO project_tickets
    (id,milestone_id,title,description,acceptance_criteria,status,execution_mode,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?)`);
  const updateStatus = db.prepare('UPDATE project_tickets SET status=?,updated_at=? WHERE id=? AND status!=?');
  const dependencies = db.prepare(`SELECT d.ticket_id AS ticketId,d.prerequisite_id AS prerequisiteId
    FROM ticket_dependencies d JOIN project_tickets t ON t.id=d.ticket_id
    JOIN milestones m ON m.id=t.milestone_id WHERE m.project_id=? ORDER BY d.ticket_id,d.prerequisite_id`);
  const deleteDependencies = db.prepare('DELETE FROM ticket_dependencies WHERE ticket_id=?');
  const insertDependency = db.prepare('INSERT INTO ticket_dependencies VALUES(?,?)');
  const touchTicket = db.prepare('UPDATE project_tickets SET updated_at=? WHERE id=?');
  const updateProject = db.prepare('UPDATE projects SET title=?,description=? WHERE id=?');
  const selectedTickets = 'SELECT t.id FROM project_tickets t JOIN milestones m ON m.id=t.milestone_id WHERE m.project_id=?';
  const deleteTicketLinks = db.prepare(`DELETE FROM ticket_dependencies WHERE ticket_id IN (${selectedTickets}) OR prerequisite_id IN (${selectedTickets})`);
  const deleteTicketData = ['coding_reviews', 'coding_deliveries', 'coding_runs', 'coding_workspaces', 'linked_work',
    'coding_tickets', 'issue_publications'].map(table => db.prepare(`DELETE FROM ${table} WHERE ticket_id IN (${selectedTickets})`));
  const deleteProjectData = [
    'DELETE FROM project_tickets WHERE milestone_id IN (SELECT id FROM milestones WHERE project_id=?)',
    ...['milestones', 'plan_drafts', 'plan_approvals', 'publication_batches'].map(table => `DELETE FROM ${table} WHERE project_id=?`),
    'DELETE FROM projects WHERE id=?',
  ].map(sql => db.prepare(sql));
  const updateMilestone = db.prepare('UPDATE milestones SET title=?,description=? WHERE id=?');
  const updateTicket = db.prepare(`UPDATE project_tickets SET title=?,description=?,acceptance_criteria=?,updated_at=?
    WHERE id=? AND (title!=? OR description!=? OR acceptance_criteria!=?)`);
  // Prepared once: every project view reads the coding link for each listed ticket.
  const codingLink = db.prepare('SELECT repository_json,issue_number FROM coding_tickets WHERE ticket_id=?');
  function parseTicket(row: Record<string, unknown>) {
    const link = codingLink.get(String(row.id));
    return parseProjectTicket(link ? { ...row, executionMode: 'codex', coding: {
      repository: link.repository_json === null ? null : JSON.parse(String(link.repository_json)) as unknown,
      issueNumber: link.issue_number,
    } } : row);
  }
  function setExecutionMode(id: string, mode: ExecutionMode) {
    if (mode === 'codex') db.prepare('INSERT OR IGNORE INTO coding_tickets(ticket_id) VALUES(?)').run(id);
    else db.prepare('DELETE FROM coding_tickets WHERE ticket_id=?').run(id);
  }
  return {
    deleteProject(id: string) {
      deleteTicketLinks.run(id, id);
      for (const statement of deleteTicketData) statement.run(id);
      for (const statement of deleteProjectData) statement.run(id);
    },
    codingBusy:(id:string)=>!!db.prepare("SELECT 1 FROM coding_runs WHERE ticket_id=? AND stage IN ('starting','coding','permission','cancelling','publishing','uncertain')").get(id),
    publicationLocked: (id: string) => !!db.prepare(`SELECT 1 FROM issue_publications i JOIN publication_batches b ON b.id=i.batch_id
      WHERE i.ticket_id=? AND b.approved_at IS NOT NULL`).get(id),
    publicationRepositoryChanged: (projectId: string, repositoryId: unknown) => !!db.prepare(`SELECT 1 FROM publication_batches
      WHERE project_id=? AND approved_at IS NOT NULL AND json_extract(repository_json,'$.id')!=?`).get(projectId, typeof repositoryId === 'number' ? repositoryId : -1),
    listProjects: () => projects.all().map(parseProject),
    listMilestones: (id: string) => milestones.all(id).map(parseMilestone),
    listTickets: (id: string) => tickets.all(id).map(parseTicket),
    listDependencies: (id: string): TicketDependency[] => dependencies.all(id).map(row => ({
      ticketId: String(row.ticketId), prerequisiteId: String(row.prerequisiteId),
    })),
    setDependencies(id: string, ids: string[], at: string) {
      deleteDependencies.run(id);
      for (const prerequisite of ids) insertDependency.run(id, prerequisite);
      touchTicket.run(at, id);
    },
    findProject(id: string) {
      const row = projectById.get(id);
      return row === undefined ? undefined : parseProject(row);
    },
    findMilestone(id: string) {
      const row = milestoneById.get(id);
      return row === undefined ? undefined : parseMilestone(row);
    },
    findTicket(id: string) {
      const row = ticketById.get(id);
      return row === undefined ? undefined : parseTicket(row);
    },
    insertProject(value: Project) {
      insertProject.run(value.id, value.title, value.description, value.createdAt);
    },
    insertMilestone(value: Milestone) {
      insertMilestone.run(value.id, value.projectId, value.title, value.description, value.createdAt);
    },
    insertTicket(value: ProjectTicket) {
      insertTicket.run(value.id, value.milestoneId, value.title, value.description, value.acceptanceCriteria,
        value.status, 'manual', value.createdAt, value.updatedAt);
      setExecutionMode(value.id, value.executionMode);
    },
    isBreakdown(id: string) {
      return !!db.prepare("SELECT 1 FROM ticket_ai WHERE ticket_id=? AND json_array_length(draft_json,'$.children')>0").get(id);
    },
    setStatus(id: string, status: TicketStatus, at: string) {
      updateStatus.run(status, at, id, status);
      if (status === 'done') db.prepare(`UPDATE project_tickets SET status='review',updated_at=? WHERE status='backlog'
        AND id IN (SELECT p.ticket_id FROM ticket_ai p JOIN json_each(p.draft_json,'$.children') item WHERE item.value=?)
        AND NOT EXISTS (SELECT 1 FROM ticket_ai p JOIN json_each(p.draft_json,'$.children') item
          LEFT JOIN project_tickets child ON child.id=item.value
          WHERE p.ticket_id=project_tickets.id AND (child.id IS NULL OR child.status!='done'))`).run(at, id);
    },
    setBlocker(id: string, reason: string, at: string) {
      db.prepare('UPDATE project_tickets SET block_reason=?,updated_at=? WHERE id=? AND block_reason!=?').run(reason, at, id, reason);
    },
    editProject(id: string, value: EntityDraft) {
      updateProject.run(value.title, value.description, id);
    },
    editMilestone(id: string, value: EntityDraft) {
      updateMilestone.run(value.title, value.description, id);
    },
    editTicket(id: string, value: TicketDetailsDraft, at: string) {
      updateTicket.run(value.title, value.description, value.acceptanceCriteria, at, id,
        value.title, value.description, value.acceptanceCriteria);
    },
    setExecutionMode(id: string, mode: ExecutionMode, at: string) {
      setExecutionMode(id, mode);
      touchTicket.run(at, id);
    },
  };
}
export type ProjectRepository = ReturnType<typeof createProjectRepository>;
