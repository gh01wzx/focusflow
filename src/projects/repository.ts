import type { DatabaseSync } from 'node:sqlite';
import { parseProject, parseMilestone, parseProjectTicket } from '../shared/project-codec.ts';
import type { Project, Milestone, ProjectTicket, TicketStatus, TicketDependency } from '../shared/projects.ts';

export function createProjectRepository(db: DatabaseSync) {
  const projectColumns = 'SELECT id,title,description,created_at AS createdAt FROM projects';
  const milestoneColumns = 'SELECT id,project_id AS projectId,title,description,created_at AS createdAt FROM milestones';
  const ticketColumns = `SELECT t.id,m.project_id AS projectId,t.milestone_id AS milestoneId,t.title,t.description,
    t.acceptance_criteria AS acceptanceCriteria,t.status,t.execution_mode AS executionMode,
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
  return {
    listProjects: () => projects.all().map(parseProject),
    listMilestones: (id: string) => milestones.all(id).map(parseMilestone),
    listTickets: (id: string) => tickets.all(id).map(parseProjectTicket),
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
      return row === undefined ? undefined : parseProjectTicket(row);
    },
    insertProject(value: Project) {
      insertProject.run(value.id, value.title, value.description, value.createdAt);
    },
    insertMilestone(value: Milestone) {
      insertMilestone.run(value.id, value.projectId, value.title, value.description, value.createdAt);
    },
    insertTicket(value: ProjectTicket) {
      insertTicket.run(value.id, value.milestoneId, value.title, value.description, value.acceptanceCriteria,
        value.status, value.executionMode, value.createdAt, value.updatedAt);
    },
    setStatus(id: string, status: TicketStatus, at: string) {
      updateStatus.run(status, at, id, status);
    },
  };
}
export type ProjectRepository = ReturnType<typeof createProjectRepository>;
