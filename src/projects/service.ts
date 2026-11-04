import type { Project, Milestone, ProjectTicket, ProjectView } from '../shared/projects.ts';
import type { ProjectRepository } from './repository.ts';
import { entityInput, parentId, ticketInput, ticketStatus, ProjectNotFoundError } from './validation.ts';

export type ProjectTransaction = <T>(operation: (now: Date) => T) => T;

export function createProjectService(repository: ProjectRepository, transaction: ProjectTransaction, nextId: () => string) {
  return {
    view: (id?: string): ProjectView => transaction(() => {
      const projects = repository.listProjects();
      const selected = id === undefined ? projects[0] : repository.findProject(id);
      if (id !== undefined && !selected) throw new ProjectNotFoundError('Project not found.');
      return {
        projects, selectedProjectId: selected?.id ?? null,
        milestones: selected ? repository.listMilestones(selected.id) : [],
        tickets: selected ? repository.listTickets(selected.id) : [],
      };
    }),
    addProject: (input: unknown): Project => transaction(now => {
      const value = { id: nextId(), ...entityInput(input), createdAt: now.toISOString() };
      repository.insertProject(value);
      return value;
    }),
    addMilestone: (input: unknown): Milestone => transaction(now => {
      const projectId = parentId(input, 'projectId');
      if (!repository.findProject(projectId)) throw new ProjectNotFoundError('Project not found.');
      const value = { id: nextId(), projectId, ...entityInput(input), createdAt: now.toISOString() };
      repository.insertMilestone(value);
      return value;
    }),
    addTicket: (input: unknown): ProjectTicket => transaction(now => {
      const draft = ticketInput(input);
      const milestone = repository.findMilestone(draft.milestoneId);
      if (!milestone) throw new ProjectNotFoundError('Milestone not found.');
      const value: ProjectTicket = { id: nextId(), projectId: milestone.projectId,
        ...draft, status: 'backlog', executionMode: 'manual',
        createdAt: now.toISOString(), updatedAt: now.toISOString() };
      repository.insertTicket(value);
      return value;
    }),
    setStatus: (id: string, input: unknown): string => transaction(now => {
      const status = ticketStatus(input);
      const ticket = repository.findTicket(id);
      if (!ticket) throw new ProjectNotFoundError('Ticket not found.');
      repository.setStatus(id, status, now.toISOString());
      return ticket.projectId;
    }),
  };
}
export type ProjectService = ReturnType<typeof createProjectService>;
