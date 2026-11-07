import type { Project, Milestone, ProjectTicket, ProjectView } from '../shared/projects.ts';
import type { ProjectRepository } from './repository.ts';
import { entityInput, parentId, ticketInput, ticketDetailsInput, ticketStatus, ProjectNotFoundError, ProjectInputError } from './validation.ts';

export type ProjectTransaction = <T>(operation: (now: Date) => T) => T;

export function createProjectService(repository: ProjectRepository, transaction: ProjectTransaction, nextId: () => string) {
  return {
    editProject: (id: string, input: unknown): string => transaction(() => {
      const value = entityInput(input);
      if (!repository.findProject(id)) throw new ProjectNotFoundError('Project not found.');
      repository.editProject(id, value);
      return id;
    }),
    editMilestone: (id: string, input: unknown): string => transaction(() => {
      const value = entityInput(input);
      const milestone = repository.findMilestone(id);
      if (!milestone) throw new ProjectNotFoundError('Milestone not found.');
      repository.editMilestone(id, value);
      return milestone.projectId;
    }),
    editTicket: (id: string, input: unknown): string => transaction(now => {
      const value = ticketDetailsInput(input);
      const ticket = repository.findTicket(id);
      if (!ticket) throw new ProjectNotFoundError('Ticket not found.');
      repository.editTicket(id, value, now.toISOString());
      return ticket.projectId;
    }),
    actions: (): ProjectView[] => transaction(() => repository.listProjects().map(project => ({
      projects: [project], selectedProjectId: project.id,
      milestones: repository.listMilestones(project.id), tickets: repository.listTickets(project.id),
    }))),
    start: (id: string): void => transaction(now => {
      const ticket = repository.findTicket(id);
      if (!ticket) throw new ProjectNotFoundError('Ticket not found.');
      if (ticket.status !== 'ready') throw new ProjectInputError('This ticket is no longer Ready. Refresh before choosing another task.');
      repository.setStatus(id, 'in_progress', now.toISOString());
    }),
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
